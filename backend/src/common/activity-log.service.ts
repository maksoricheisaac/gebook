import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildRlsContext } from '../prisma/rls-context';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import { TENANT_MANAGEMENT_ROLES } from '../modules/tenants/tenant-context';
import type { TenantContext } from '../modules/tenants/tenant-context';
import type { ListActivityLogQuery } from '../modules/activity-log/dto/list-activity-log.query';
import type { PaginatedActivityLogResponse } from '../modules/activity-log/dto/activity-log.response';

export interface ActivityLogEntry {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Motif saisi par l'auteur de l'action, lorsqu'il en existe un (remboursement). */
  description?: string;
}

/**
 * Journal des actions sensibles (audit S-07). Utilisé par les contrôleurs
 * d'administration : chaque création, modification ou suppression du catalogue
 * doit pouvoir être retracée jusqu'à l'administrateur qui l'a faite.
 *
 * `record()` doit pouvoir être appelée depuis n'importe quel contexte
 * (authentifié, admin, système) sans connaître de tenant actif — c'est la
 * seule table où l'écriture RLS est inconditionnelle (Phase 4,
 * `20260823020000_add_rls_policies` : `activity_logs_insert ... WITH CHECK (true)`).
 * INSERT brut plutôt que `prisma.activityLog.create()` : PostgreSQL exige que
 * la policy SELECT soit aussi satisfaite pour le `RETURNING` implicite d'un
 * `.create()`, ce qui aurait recréé exactement la dépendance à un contexte
 * qu'on cherche à éviter ici. Un INSERT sans RETURNING ne déclenche pas cette
 * vérification.
 */
@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ActivityLogEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, description, created_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${entry.userId}::uuid,
        ${entry.action},
        ${entry.entityType ?? null},
        ${entry.entityId ?? null}::uuid,
        ${entry.description ?? null},
        now()
      )
    `;
  }

  /**
   * Lecture du journal : un superadmin voit tout, un owner/admin de tenant ne
   * voit que son propre espace — exactement la policy RLS `activity_logs_select`
   * (`20260823020000_add_rls_policies`). Revérifiée ici pour répondre un 403
   * clair plutôt que de laisser un rôle insuffisant tomber sur une page vide.
   */
  async list(
    admin: AuthenticatedUser,
    tenant: TenantContext,
    query: ListActivityLogQuery,
  ): Promise<PaginatedActivityLogResponse> {
    if (
      !tenant.isPlatformAdmin &&
      (!tenant.tenantId ||
        !tenant.role ||
        !TENANT_MANAGEMENT_ROLES.includes(tenant.role))
    ) {
      throw new ForbiddenException(
        "Votre rôle ne permet pas de consulter le journal d'activité de cet espace.",
      );
    }

    const scopedTenantId = tenant.isPlatformAdmin
      ? (query.tenantId ?? null)
      : tenant.tenantId;
    const ctx = buildRlsContext(admin, scopedTenantId);

    const where: Prisma.ActivityLogWhereInput = {
      ...(tenant.isPlatformAdmin && query.tenantId
        ? { tenantId: query.tenantId }
        : {}),
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.activityLog.count({ where }),
        tx.activityLog.findMany({
          where,
          include: {
            tenant: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ]),
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant?.name ?? null,
        userId: row.userId,
        userName: row.user
          ? `${row.user.firstName} ${row.user.lastName}`.trim()
          : null,
        userEmail: row.user?.email ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }
}
