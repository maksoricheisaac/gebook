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

  async balance(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<PayoutBalanceResponse> {
    const tenantId = requireTenantId(tenant);
    const settings = await this.economicSettings.get();
    const eligible = await this.eligibleSaleDistributions(
      admin,
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

  async listMine(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<PayoutResponse[]> {
    const tenantId = requireTenantId(tenant);
    // Corrige un bug pré-existant (audit FeexPay, vérification du mode
    // manuel) : sans contexte RLS, la policy `payouts_select` (comme
    // `sale_distributions_select` pour `balance()` ci-dessous) ne voit
    // `app.current_tenant_id`/`app.is_platform_admin` renseignés nulle part
    // et ne retourne donc jamais aucune ligne — un owner/admin/finance de
    // tenant ne pouvait ni consulter son solde ni la liste de ses demandes.
    const payouts = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) =>
        tx.payout.findMany({
          where: { tenantId },
          include: { tenant: { select: { name: true } } },
          orderBy: { requestedAt: 'desc' },
        }),
    );
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

    const payout = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      async (tx) => {
        // Réservation atomique — corrige une course identifiée à l'audit
        // (CRITIQUE) : l'ancienne version lisait les lignes `available` HORS
        // transaction, puis les revendiquait par leurs id sans revérifier
        // `payoutId: null` au moment de l'écriture. Deux demandes
        // concurrentes pouvaient alors lire le même jeu de lignes et
        // revendiquer deux fois le même solde.
        //
        // Ici, le montant est encore inconnu. `chk_payouts_amount` interdit un
        // `Payout` à 0 ou négatif (un retrait sans montant n'a pas de sens
        // métier) : `0.01` n'est qu'un placeholder technique, jamais visible
        // hors de cette transaction, corrigé par le `payout.update` final
        // avant le commit. La création du `Payout` fournit l'id nécessaire
        // pour que l'`updateMany` qui suit reste la SEULE opération qui
        // revendique des lignes : sa clause `payoutId: null` est réévaluée
        // par Postgres au moment même de l'UPDATE (verrouillage de ligne),
        // pas au moment d'une lecture antérieure. Sous isolation READ
        // COMMITTED (le défaut Postgres), une seconde transaction concurrente
        // qui tente le même `updateMany` attend que la première committe,
        // puis ne trouve plus aucune ligne à `payoutId: null` parmi celles
        // déjà revendiquées — elle ne peut donc plus les revendiquer une
        // seconde fois.
        const created = await tx.payout.create({
          data: {
            tenantId,
            requestedBy: admin.id,
            amount: '0.01',
            currency,
            method: dto.method,
            beneficiaryName: dto.beneficiaryName,
            beneficiaryCountry: dto.beneficiaryCountry,
            beneficiaryAccount: dto.beneficiaryAccount,
            status: PayoutRequestStatus.pending,
          },
        });

        const claim = await tx.saleDistribution.updateMany({
          where: this.eligibilityWhere(tenantId, settings.payoutDelayDays),
          data: { payoutId: created.id },
        });

        if (claim.count === 0) {
          throw new BadRequestException(
            'Aucun montant disponible au retrait pour le moment.',
          );
        }

        const claimedRows = await tx.saleDistribution.findMany({
          where: { payoutId: created.id },
          select: { authorNetAmount: true },
        });
        const total = claimedRows.reduce(
          (sum, row) => sum.add(row.authorNetAmount),
          new Prisma.Decimal(0),
        );

        if (settings.payoutMinThreshold) {
          const threshold = new Prisma.Decimal(settings.payoutMinThreshold);
          if (total.lessThan(threshold)) {
            throw new BadRequestException(
              `Le solde disponible (${total.toFixed(2)} ${currency}) est inférieur au seuil minimum de retrait (${threshold.toFixed(2)} ${currency}).`,
            );
          }
        }

        return tx.payout.update({
          where: { id: created.id },
          data: { amount: total },
          include: { tenant: { select: { name: true } } },
        });
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
   * Condition d'éligibilité au retrait, partagée entre la lecture
   * informative (`balance`) et la revendication atomique (`request`) : lignes
   * `available`, jamais encore revendiquées par une autre demande
   * (`payoutId: null`), et — si un délai de rétention est configuré (§4) —
   * figées depuis assez longtemps. Un délai non configuré n'en impose aucun
   * (brief §4 : ne rien inventer par défaut), ce qui correspond au
   * comportement déjà en vigueur avant cette fonctionnalité (une vente est
   * `available` dès son figeage).
   *
   * Utilisée telle quelle comme clause `where` d'un `updateMany` dans
   * `request()` : c'est cette réévaluation au moment de l'écriture, pas une
   * liste d'id lue à l'avance, qui rend la revendication atomique.
   */
  private eligibilityWhere(
    tenantId: string,
    delayDays: number | null,
  ): Prisma.SaleDistributionWhereInput {
    const cutoff =
      delayDays && delayDays > 0
        ? new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000)
        : undefined;

    return {
      payoutStatus: PayoutStatus.available,
      payoutId: null,
      author: { tenantId },
      ...(cutoff && { calculatedAt: { lte: cutoff } }),
    };
  }

  private async eligibleSaleDistributions(
    admin: AuthenticatedUser,
    tenantId: string,
    delayDays: number | null,
  ) {
    // Même correctif que `listMine()` : `sale_distributions_select` exige un
    // contexte RLS, jamais implicite pour une simple lecture hors transaction.
    return this.prisma.withRlsContext(buildRlsContext(admin, tenantId), (tx) =>
      tx.saleDistribution.findMany({
        where: this.eligibilityWhere(tenantId, delayDays),
        select: { id: true, authorNetAmount: true },
      }),
    );
  }
}
