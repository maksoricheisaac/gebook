import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import { escapeHtml, renderEmailLayout } from '../mail/email-layout';
import { MailService, MailUnavailableError } from '../mail/mail.service';
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
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
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

    const { member, tenantName } = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenantId), async (tx) => {
        const user = await tx.user.findUnique({ where: { email: dto.email } });
        if (!user) {
          throw new NotFoundException(
            "Aucun compte GeBook n'existe avec cette adresse e-mail. La personne doit d'abord créer un compte lecteur, avant de pouvoir rejoindre l'équipe.",
          );
        }

        // Phase 8 : `invited`, pas `active` — l'ajout immédiat ignorait le
        // statut prévu par le schéma. La personne devient réellement membre
        // à l'acceptation (`TenantsService.acceptInvitation`), pas à
        // l'invitation elle-même.
        const created = await tx.tenantMember.create({
          data: {
            tenantId,
            userId: user.id,
            role: dto.role,
            status: 'invited',
          },
          include: memberInclude,
        });

        const tenantRecord = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true },
        });

        return { member: created, tenantName: tenantRecord.name };
      })
      .catch((error: unknown) => {
        throw translateMemberError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.team.invite',
      entityType: 'tenant_member',
      entityId: member.id,
      tenantId,
    });

    await this.sendInviteEmail(member, tenantName);

    return toTeamMemberResponse(member);
  }

  /**
   * L'adhésion `invited` est déjà écrite en base et reste découvrable dans
   * `/mon-espace` sans dépendre de cet e-mail (l'acceptation est authentifiée
   * par session, pas par un jeton mailé — voir `TenantsService.acceptInvitation`).
   * Contrairement à `EmailVerificationService` (où l'e-mail EST l'action), un
   * échec SMTP ne doit donc pas faire échouer l'invitation déjà réussie :
   * journalisé, jamais renvoyé à l'appelant.
   */
  private async sendInviteEmail(
    member: Prisma.TenantMemberGetPayload<{ include: typeof memberInclude }>,
    tenantName: string,
  ): Promise<void> {
    const frontendUrl = this.frontendUrl();
    const firstName = escapeHtml(member.user.firstName);
    const tenant = escapeHtml(tenantName);

    const html = renderEmailLayout({
      previewText: `Vous avez été invité(e) à rejoindre ${tenantName} sur GeBook.`,
      heading: `Rejoignez ${tenant} sur GeBook`,
      paragraphs: [
        `Bonjour ${firstName},`,
        `Vous avez été invité(e) à rejoindre l'équipe de « ${tenant} » sur GeBook. Connectez-vous à votre compte pour accepter cette invitation depuis votre espace.`,
      ],
      ctaLabel: 'Voir l’invitation',
      ctaUrl: `${frontendUrl}/mon-espace`,
      logoUrl: `${frontendUrl}/logo_gebook.png`,
    });

    try {
      await this.mail.send({
        to: member.user.email,
        subject: `Invitation à rejoindre ${tenantName} — GeBook`,
        html,
      });
    } catch (error) {
      if (error instanceof MailUnavailableError) {
        this.logger.warn(
          `Invitation créée mais e-mail non envoyé à ${member.user.email} : ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }

  private frontendUrl(): string {
    const configured = this.config.get<string>('APP_PUBLIC_URL');
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    const corsOrigins = this.config.get<string[]>('CORS_ORIGINS') ?? [];
    return (corsOrigins[0] ?? 'http://localhost:3000').replace(/\/$/, '');
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
      tenantId,
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
      tenantId,
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
