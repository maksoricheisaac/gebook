import { Injectable, NotFoundException } from '@nestjs/common';
import type { DistributionTerms } from '../../generated/prisma/client';
import type { TenantType } from '../../generated/prisma/enums';
import { ActivityLogService } from '../../common/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateDistributionTermsDto } from './dto/distribution-terms.dto';

/**
 * Conditions de distribution versionnées par type de tenant (mission
 * plateforme de paiement, §16-19). Une nouvelle version ne modifie jamais
 * une acceptation déjà enregistrée pour une version antérieure —
 * `TenantTermsAcceptance` fige quelle version était en vigueur au moment de
 * l'acceptation (`fk_terms_acceptance_terms` en `RESTRICT`, jamais
 * `CASCADE`) : cette table elle-même ne modifie ni ne supprime jamais une
 * version publiée, elle n'en ajoute que de nouvelles.
 */
@Injectable()
export class DistributionTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /** Version en vigueur pour un type de tenant — ce que l'onboarding doit faire accepter. */
  async activeFor(tenantType: TenantType): Promise<DistributionTerms> {
    const terms = await this.prisma.distributionTerms.findFirst({
      where: { tenantType, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!terms) {
      throw new NotFoundException(
        "Aucune condition de distribution n'est publiée pour ce type d'espace.",
      );
    }

    return terms;
  }

  async listForAdmin(tenantType?: TenantType): Promise<DistributionTerms[]> {
    return this.prisma.distributionTerms.findMany({
      where: tenantType ? { tenantType } : undefined,
      orderBy: [{ tenantType: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Publie une nouvelle version : la précédente version active du même type
   * (s'il y en a une) devient inactive dans la même transaction — au plus une
   * version active par type à la fois, jamais deux en même temps. Un tenant
   * déjà créé garde l'acceptation de sa propre version, cette publication ne
   * la touche jamais (brief §18 : « une nouvelle version peut exiger une
   * nouvelle acceptation », pas rétroactive).
   */
  async publish(
    dto: CreateDistributionTermsDto,
    adminId: string,
  ): Promise<DistributionTerms> {
    const created = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.distributionTerms.findFirst({
        where: { tenantType: dto.tenantType },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.distributionTerms.updateMany({
        where: { tenantType: dto.tenantType, isActive: true },
        data: { isActive: false },
      });

      return tx.distributionTerms.create({
        data: {
          tenantType: dto.tenantType,
          version: nextVersion,
          title: dto.title,
          content: dto.content,
          isActive: true,
        },
      });
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.distribution-terms.publish',
      entityType: 'distribution_terms',
      entityId: created.id,
      description: `${created.tenantType} — version ${created.version}`,
    });

    return created;
  }
}
