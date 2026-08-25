import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TENANT_MANAGEMENT_ROLES } from './tenant-context';
import type { TenantContext } from './tenant-context';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  toTeamMemberResponse,
  type TeamMemberResponse,
} from './dto/team-member.response';

const memberInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
};

/** Aligné sur `tenant_members_insert`/`_update`/`_delete` (RLS) : owner/admin, ou platform_admin. */
function assertCanManageTeam(tenant: TenantContext): void {
  if (tenant.isPlatformAdmin) {
    return;
  }
  if (!tenant.role || !TENANT_MANAGEMENT_ROLES.includes(tenant.role)) {
    throw new ForbiddenException(
      "Votre rôle ne permet pas de gérer l'équipe de cet espace.",
    );
  }
}

/**
 * Au-delà de ce que RLS impose : seul un propriétaire (ou le superadmin) peut
 * créer un autre propriétaire — un simple `admin` ne doit pas pouvoir
 * s'auto-promouvoir en passant par un compte complice (matrice de rôles).
 */
function assertCanAssignOwner(tenant: TenantContext): void {
  if (tenant.isPlatformAdmin) {
    return;
  }
  if (tenant.role !== 'owner') {
    throw new ForbiddenException(
      'Seul un propriétaire peut attribuer le rôle de propriétaire.',
    );
  }
}

/** `TenantAccessGuard` garantit un tenant actif pour un membre ; seul un platform_admin sans sélection peut encore arriver ici avec `tenantId: null`. */
function requireTenantId(tenant: TenantContext): string {
  if (!tenant.tenantId) {
    throw new ForbiddenException(
      "Sélectionnez d'abord une maison d'édition active pour gérer son équipe.",
    );
  }
  return tenant.tenantId;
}

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TeamMemberResponse[]> {
    const tenantId = requireTenantId(tenant);

    const members = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) =>
        tx.tenantMember.findMany({
          where: { tenantId },
          include: memberInclude,
          orderBy: { createdAt: 'asc' },
        }),
    );

    return members.map(toTeamMemberResponse);
  }

  async invite(
    dto: InviteMemberDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TeamMemberResponse> {
    assertCanManageTeam(tenant);
    if (dto.role === 'owner') {
      assertCanAssignOwner(tenant);
    }
    const tenantId = requireTenantId(tenant);

    const member = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenantId), async (tx) => {
        const user = await tx.user.findUnique({ where: { email: dto.email } });
        if (!user) {
          throw new NotFoundException(
            "Aucun compte GeBook n'existe avec cette adresse e-mail. La personne doit d'abord créer un compte lecteur, avant de pouvoir rejoindre l'équipe.",
          );
        }

        return tx.tenantMember.create({
          data: { tenantId, userId: user.id, role: dto.role, status: 'active' },
          include: memberInclude,
        });
      })
      .catch((error: unknown) => {
        throw translateMemberError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.team.invite',
      entityType: 'tenant_member',
      entityId: member.id,
    });

    return toTeamMemberResponse(member);
  }

  async updateRole(
    memberId: string,
    dto: UpdateMemberRoleDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TeamMemberResponse> {
    assertCanManageTeam(tenant);
    const tenantId = requireTenantId(tenant);

    const updated = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenantId), async (tx) => {
        const existing = await tx.tenantMember.findUnique({
          where: { id: memberId },
        });
        if (!existing || existing.tenantId !== tenantId) {
          throw new NotFoundException(
            "Ce membre n'existe pas dans cet espace.",
          );
        }

        if (
          existing.role === 'owner' &&
          !tenant.isPlatformAdmin &&
          tenant.role !== 'owner'
        ) {
          throw new ForbiddenException(
            'Seul un propriétaire peut modifier le rôle d’un autre propriétaire.',
          );
        }
        if (dto.role === 'owner') {
          assertCanAssignOwner(tenant);
        }
        if (existing.role === 'owner' && dto.role !== ('owner' as const)) {
          await assertNotLastOwner(tx, tenantId, existing.id);
        }

        return tx.tenantMember.update({
          where: { id: memberId },
          data: { role: dto.role },
          include: memberInclude,
        });
      })
      .catch((error: unknown) => {
        throw translateMemberError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.team.update_role',
      entityType: 'tenant_member',
      entityId: memberId,
    });

    return toTeamMemberResponse(updated);
  }

  async remove(
    memberId: string,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<void> {
    const tenantId = requireTenantId(tenant);

    await this.prisma
      .withRlsContext(buildRlsContext(admin, tenantId), async (tx) => {
        const existing = await tx.tenantMember.findUnique({
          where: { id: memberId },
        });
        if (!existing || existing.tenantId !== tenantId) {
          throw new NotFoundException(
            "Ce membre n'existe pas dans cet espace.",
          );
        }

        const isSelf = existing.userId === admin.id;
        if (!isSelf) {
          assertCanManageTeam(tenant);
        }
        if (existing.role === 'owner') {
          if (!isSelf && !tenant.isPlatformAdmin && tenant.role !== 'owner') {
            throw new ForbiddenException(
              'Seul un propriétaire peut retirer un autre propriétaire.',
            );
          }
          await assertNotLastOwner(tx, tenantId, existing.id);
        }

        await tx.tenantMember.delete({ where: { id: memberId } });
      })
      .catch((error: unknown) => {
        throw translateMemberError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.team.remove',
      entityType: 'tenant_member',
      entityId: memberId,
    });
  }
}

/** Un espace doit toujours garder au moins un propriétaire actif. */
async function assertNotLastOwner(
  tx: Prisma.TransactionClient,
  tenantId: string,
  excludingMemberId: string,
): Promise<void> {
  const remainingOwners = await tx.tenantMember.count({
    where: {
      tenantId,
      role: 'owner',
      status: 'active',
      id: { not: excludingMemberId },
    },
  });
  if (remainingOwners === 0) {
    throw new ConflictException(
      "Impossible : cet espace n'aurait plus aucun propriétaire. Attribuez d'abord le rôle à quelqu'un d'autre.",
    );
  }
}

function translateMemberError(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(
      'Cette personne fait déjà partie de cet espace.',
    );
  }
  return error as Error;
}
