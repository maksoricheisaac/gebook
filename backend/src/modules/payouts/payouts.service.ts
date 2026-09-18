import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  PayoutRequestStatus,
  PayoutStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { EconomicSettingsService } from '../settings/economic-settings.service';
import { TENANT_FINANCE_ROLES } from '../tenants/tenant-context';
import type { TenantContext } from '../tenants/tenant-context';
import {
  PayoutBalanceResponse,
  PayoutResponse,
  RequestPayoutDto,
} from './dto/payout.dto';

const DEFAULT_CURRENCY = 'XAF';

function assertCanRequestPayout(tenant: TenantContext): void {
  if (tenant.isPlatformAdmin) return;
  if (!tenant.role || !TENANT_FINANCE_ROLES.includes(tenant.role)) {
    throw new ForbiddenException(
      'Votre rôle ne permet pas de demander un retrait pour cet espace.',
    );
  }
}

function requireTenantId(tenant: TenantContext): string {
  if (!tenant.tenantId) {
    throw new ForbiddenException(
      "Sélectionnez d'abord un espace actif pour gérer ses retraits.",
    );
  }
  return tenant.tenantId;
}

function toResponse(
  payout: Prisma.PayoutGetPayload<{
    include: { tenant: { select: { name: true } } };
  }>,
): PayoutResponse {
  return {
    id: payout.id,
    tenantId: payout.tenantId,
    tenantName: payout.tenant.name,
    amount: payout.amount.toFixed(2),
    currency: payout.currency,
    method: payout.method,
    status: payout.status,
    beneficiaryName: payout.beneficiaryName,
    beneficiaryCountry: payout.beneficiaryCountry,
    requestedAt: payout.requestedAt.toISOString(),
    approvedAt: payout.approvedAt?.toISOString() ?? null,
    processedAt: payout.processedAt?.toISOString() ?? null,
    failureReason: payout.failureReason,
  };
}

/**
 * Demandes de retrait côté espace (auteur/maison d'édition) — brief §1
 * (« demande de retrait reçue ») et §4 (seuil/délai/devise configurables).
 * Le traitement (approuver/refuser/marquer payé) reste réservé à
 * l'administration plateforme (`AdminPayoutsService`) : brief §23, mode
 * manuel tant que l'automatique n'est pas fiabilisé.
 *
 * Simplification volontaire pour cette V1 : une demande retire toujours
 * l'intégralité du solde disponible de l'espace (pas de retrait partiel) —
 * le montant le plus simple à comprendre pour un auteur, et le seuil minimum
 * configurable (§4) reste le seul garde-fou nécessaire tant qu'aucun besoin
 * de retrait partiel n'est exprimé.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly transactionalMail: TransactionalMailService,
    private readonly economicSettings: EconomicSettingsService,
  ) {}

  async balance(tenant: TenantContext): Promise<PayoutBalanceResponse> {
    const tenantId = requireTenantId(tenant);
    const settings = await this.economicSettings.get();
    const eligible = await this.eligibleSaleDistributions(
      tenantId,
      settings.payoutDelayDays,
    );
    const total = eligible.reduce(
      (sum, row) => sum.add(row.authorNetAmount),
      new Prisma.Decimal(0),
    );
    const currency = settings.payoutCurrency ?? DEFAULT_CURRENCY;
    const threshold = settings.payoutMinThreshold
      ? new Prisma.Decimal(settings.payoutMinThreshold)
      : null;

    return {
      availableBalance: total.toFixed(2),
      currency,
      minThreshold: settings.payoutMinThreshold,
      delayDays: settings.payoutDelayDays,
      belowThreshold: threshold !== null && total.lessThan(threshold),
    };
  }

  async listMine(tenant: TenantContext): Promise<PayoutResponse[]> {
    const tenantId = requireTenantId(tenant);
    const payouts = await this.prisma.payout.findMany({
      where: { tenantId },
      include: { tenant: { select: { name: true } } },
      orderBy: { requestedAt: 'desc' },
    });
    return payouts.map(toResponse);
  }

  async request(
    dto: RequestPayoutDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<PayoutResponse> {
    assertCanRequestPayout(tenant);
    const tenantId = requireTenantId(tenant);
    const settings = await this.economicSettings.get();
    const currency = settings.payoutCurrency ?? DEFAULT_CURRENCY;

    const eligible = await this.eligibleSaleDistributions(
      tenantId,
      settings.payoutDelayDays,
    );
    const total = eligible.reduce(
      (sum, row) => sum.add(row.authorNetAmount),
      new Prisma.Decimal(0),
    );

    if (total.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Aucun montant disponible au retrait pour le moment.',
      );
    }

    if (settings.payoutMinThreshold) {
      const threshold = new Prisma.Decimal(settings.payoutMinThreshold);
      if (total.lessThan(threshold)) {
        throw new BadRequestException(
          `Le solde disponible (${total.toFixed(2)} ${currency}) est inférieur au seuil minimum de retrait (${threshold.toFixed(2)} ${currency}).`,
        );
      }
    }

    const payout = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      async (tx) => {
        const created = await tx.payout.create({
          data: {
            tenantId,
            requestedBy: admin.id,
            amount: total,
            currency,
            method: dto.method,
            beneficiaryName: dto.beneficiaryName,
            beneficiaryCountry: dto.beneficiaryCountry,
            beneficiaryAccount: dto.beneficiaryAccount,
            status: PayoutRequestStatus.pending,
          },
          include: { tenant: { select: { name: true } } },
        });

        await tx.saleDistribution.updateMany({
          where: { id: { in: eligible.map((row) => row.id) } },
          data: { payoutId: created.id },
        });

        return created;
      },
    );

    await this.activityLog.record({
      userId: admin.id,
      action: 'tenant.payout.request',
      entityType: 'payout',
      entityId: payout.id,
      tenantId,
    });

    await this.transactionalMail.sendPayoutRequested(
      { email: admin.email, firstName: admin.firstName },
      payout.amount.toFixed(2),
      payout.currency,
    );

    return toResponse(payout);
  }

  /**
   * Lignes de vente réellement retirables : `available`, jamais encore
   * revendiquées par une autre demande (`payoutId: null`), et — si un délai
   * de rétention est configuré (§4) — figées depuis assez longtemps. Un
   * délai non configuré n'en impose aucun (brief §4 : ne rien inventer par
   * défaut), ce qui correspond au comportement déjà en vigueur avant cette
   * fonctionnalité (une vente est `available` dès son figeage).
   */
  private async eligibleSaleDistributions(
    tenantId: string,
    delayDays: number | null,
  ) {
    const cutoff =
      delayDays && delayDays > 0
        ? new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000)
        : undefined;

    return this.prisma.saleDistribution.findMany({
      where: {
        payoutStatus: PayoutStatus.available,
        payoutId: null,
        author: { tenantId },
        ...(cutoff && { calculatedAt: { lte: cutoff } }),
      },
      select: { id: true, authorNetAmount: true },
    });
  }
}
