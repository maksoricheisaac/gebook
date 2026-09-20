import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayoutRequestStatus,
  PayoutStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import {
  MarkPayoutPaidDto,
  PayoutResponse,
  RejectPayoutDto,
} from './dto/payout.dto';

const payoutInclude = {
  tenant: { select: { name: true } },
  requester: { select: { email: true, firstName: true } },
};

function toResponse(payout: {
  id: string;
  tenantId: string;
  tenant: { name: string };
  amount: { toFixed: (n: number) => string };
  currency: string;
  method: string;
  status: string;
  beneficiaryName: string;
  beneficiaryCountry: string;
  requestedAt: Date;
  approvedAt: Date | null;
  processedAt: Date | null;
  failureReason: string | null;
}): PayoutResponse {
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
 * Traitement des demandes de retrait par l'administration plateforme —
 * mode manuel uniquement pour cette V1 (brief §23) : aucun appel à un pilote
 * de reversement (FeexPay…) n'est déclenché automatiquement ici, cohérent
 * avec le paiement entrant lui-même pas encore ouvert en production. Marquer
 * un retrait « payé » enregistre qu'un versement a réellement eu lieu
 * (virement, dépôt Mobile Money…) effectué hors plateforme par l'équipe
 * GeBook — pas une promesse que la plateforme l'a exécuté elle-même.
 */
@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly transactionalMail: TransactionalMailService,
  ) {}

  async list(status?: PayoutRequestStatus): Promise<PayoutResponse[]> {
    const payouts = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payout.findMany({
        where: status ? { status } : undefined,
        include: payoutInclude,
        orderBy: { requestedAt: 'desc' },
      }),
    );
    return payouts.map(toResponse);
  }

  async approve(id: string, adminId: string): Promise<PayoutResponse> {
    await this.findPendingOrThrow(id);

    const updated = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payout.update({
        where: { id },
        data: {
          status: PayoutRequestStatus.approved,
          approvedBy: adminId,
          approvedAt: new Date(),
        },
        include: payoutInclude,
      }),
    );

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.payout.approve',
      entityType: 'payout',
      entityId: id,
      tenantId: updated.tenantId,
    });

    await this.transactionalMail.sendPayoutApproved(
      updated.requester,
      updated.amount.toFixed(2),
      updated.currency,
    );

    return toResponse(updated);
  }

  async reject(
    id: string,
    dto: RejectPayoutDto,
    adminId: string,
  ): Promise<PayoutResponse> {
    const payout = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payout.findUnique({ where: { id } }),
    );
    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }
    if (
      payout.status !== PayoutRequestStatus.pending &&
      payout.status !== PayoutRequestStatus.approved
    ) {
      throw new BadRequestException(
        'Seule une demande en attente ou approuvée peut être refusée.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.prisma.applyRlsContext(tx, SYSTEM_CONTEXT);
      // Les lignes de vente revendiquées par cette demande redeviennent
      // disponibles pour une prochaine demande — jamais perdues.
      await tx.saleDistribution.updateMany({
        where: { payoutId: id },
        data: { payoutId: null },
      });
      return tx.payout.update({
        where: { id },
        data: {
          status: PayoutRequestStatus.cancelled,
          approvedBy: adminId,
          failureReason: dto.reason,
        },
        include: payoutInclude,
      });
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.payout.reject',
      entityType: 'payout',
      entityId: id,
      tenantId: updated.tenantId,
      description: dto.reason,
    });

    await this.transactionalMail.sendPayoutRejected(
      updated.requester,
      updated.amount.toFixed(2),
      updated.currency,
      dto.reason,
    );

    return toResponse(updated);
  }

  async markPaid(
    id: string,
    dto: MarkPayoutPaidDto,
    adminId: string,
  ): Promise<PayoutResponse> {
    const payout = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payout.findUnique({ where: { id } }),
    );
    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }
    if (payout.status !== PayoutRequestStatus.approved) {
      throw new BadRequestException(
        'Seule une demande approuvée peut être marquée comme payée.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.prisma.applyRlsContext(tx, SYSTEM_CONTEXT);
      await tx.saleDistribution.updateMany({
        where: { payoutId: id },
        data: { payoutStatus: PayoutStatus.paid },
      });
      return tx.payout.update({
        where: { id },
        data: {
          status: PayoutRequestStatus.paid,
          processedAt: new Date(),
          providerReference: dto.providerReference || undefined,
        },
        include: payoutInclude,
      });
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.payout.mark_paid',
      entityType: 'payout',
      entityId: id,
      tenantId: updated.tenantId,
    });

    await this.transactionalMail.sendPayoutPaid(
      updated.requester,
      updated.amount.toFixed(2),
      updated.currency,
    );

    return toResponse(updated);
  }

  private async findPendingOrThrow(id: string) {
    const payout = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payout.findUnique({ where: { id } }),
    );
    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }
    if (payout.status !== PayoutRequestStatus.pending) {
      throw new BadRequestException(
        'Seule une demande en attente peut être approuvée.',
      );
    }
    return payout;
  }
}
