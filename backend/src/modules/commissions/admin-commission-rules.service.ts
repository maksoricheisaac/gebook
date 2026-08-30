import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { CommissionRule } from '../../generated/prisma/client';
import { CommissionType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../../common/activity-log.service';
import type { RlsContext } from '../../prisma/rls-context';
import type {
  CreateCommissionRuleDto,
  ListQuery,
  UpdateCommissionRuleDto,
} from './dto/commission-rule.dto';

@Injectable()
export class AdminCommissionRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(query: ListQuery): Promise<{
    data: CommissionRule[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }> {
    // `AdminCommissionsController` est `@Roles('admin')` : platform_admin
    // garanti. Nécessaire pour que `include: { author }` (RLS) reste correct
    // même pour un auteur non `active`.
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const [total, data] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.commissionRule.count(),
        tx.commissionRule.findMany({
          include: {
            author: { select: { penName: true } },
            tenant: { select: { name: true } },
          },
          orderBy: [{ effectiveFrom: 'desc' }],
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ]),
    );

    return {
      data,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async create(
    dto: CreateCommissionRuleDto,
    adminId: string,
  ): Promise<CommissionRule> {
    this.assertConsistent(dto.commissionType, dto.commissionValue);
    this.assertPeriod(dto.effectiveFrom, dto.effectiveTo);
    this.assertScope(dto.authorId, dto.tenantId, dto.tenantType);

    const rule = await this.prisma.commissionRule.create({
      data: {
        name: dto.name,
        authorId: dto.authorId ?? null,
        tenantId: dto.tenantId ?? null,
        tenantType: dto.tenantType ?? null,
        commissionType: dto.commissionType,
        commissionValue: new Prisma.Decimal(dto.commissionValue),
        calculationBase: dto.calculationBase,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        ...(dto.status && { status: dto.status }),
      },
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.commission-rule.create',
      entityType: 'commission_rule',
      entityId: rule.id,
    });

    return rule;
  }

  async update(
    id: string,
    dto: UpdateCommissionRuleDto,
    adminId: string,
  ): Promise<CommissionRule> {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Cette règle de commission n'existe pas.");
    }

    const type = dto.commissionType ?? existing.commissionType;
    const value = dto.commissionValue ?? existing.commissionValue.toString();
    this.assertConsistent(type, value);
    this.assertPeriod(
      dto.effectiveFrom ?? existing.effectiveFrom.toISOString(),
      dto.effectiveTo ?? existing.effectiveTo?.toISOString(),
    );
    this.assertScope(
      dto.authorId !== undefined
        ? dto.authorId
        : (existing.authorId ?? undefined),
      dto.tenantId !== undefined
        ? dto.tenantId
        : (existing.tenantId ?? undefined),
      dto.tenantType !== undefined
        ? dto.tenantType
        : (existing.tenantType ?? undefined),
    );

    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.authorId !== undefined && { authorId: dto.authorId }),
        ...(dto.tenantId !== undefined && { tenantId: dto.tenantId }),
        ...(dto.tenantType !== undefined && { tenantType: dto.tenantType }),
        ...(dto.commissionType !== undefined && {
          commissionType: dto.commissionType,
        }),
        ...(dto.commissionValue !== undefined && {
          commissionValue: new Prisma.Decimal(dto.commissionValue),
        }),
        ...(dto.calculationBase !== undefined && {
          calculationBase: dto.calculationBase,
        }),
        ...(dto.effectiveFrom !== undefined && {
          effectiveFrom: new Date(dto.effectiveFrom),
        }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.commission-rule.update',
      entityType: 'commission_rule',
      entityId: id,
    });

    return rule;
  }

  /**
   * Supprime une règle. Les répartitions déjà figées la perdent en référence
   * (`ON DELETE SET NULL`) mais conservent leurs montants : une suppression ne
   * réécrit jamais l'histoire comptable (règle n° 14).
   */
  async remove(id: string, adminId: string): Promise<void> {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Cette règle de commission n'existe pas.");
    }

    await this.prisma.commissionRule.delete({ where: { id } });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.commission-rule.delete',
      entityType: 'commission_rule',
      entityId: id,
    });
  }

  /**
   * Le plafond de 100 ne vaut que pour un pourcentage — une commission fixe peut
   * valoir n'importe quel montant. La base porte la même règle en `CHECK` ; la
   * refaire ici permet de répondre un message clair plutôt qu'une erreur 500.
   */
  private assertConsistent(type: CommissionType, value: string): void {
    if (
      type === CommissionType.percentage &&
      new Prisma.Decimal(value).greaterThan(100)
    ) {
      throw new BadRequestException(
        'Un pourcentage de commission ne peut pas dépasser 100 %.',
      );
    }
  }

  private assertPeriod(from: string, to?: string | null): void {
    if (to && new Date(to) < new Date(from)) {
      throw new BadRequestException(
        'La fin de validité ne peut pas précéder son début.',
      );
    }
  }

  /**
   * Même règle que `chk_commission_rules_scope` en base, vérifiée ici pour
   * répondre un message clair plutôt qu'une erreur 500 de contrainte violée.
   * Une règle cible au plus un axe de portée : auteur précis, tenant précis,
   * ou type de tenant — jamais deux à la fois (brief §12-15, priorité
   * documentée dans `selectRule()`).
   */
  private assertScope(
    authorId?: string | null,
    tenantId?: string | null,
    tenantType?: string | null,
  ): void {
    const scopesSet = [authorId, tenantId, tenantType].filter(
      (value) => value !== undefined && value !== null,
    ).length;

    if (scopesSet > 1) {
      throw new BadRequestException(
        'Une règle de commission ne peut cibler qu’un seul niveau à la fois : auteur, tenant, ou type de tenant.',
      );
    }
  }
}
