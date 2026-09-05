import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TenantType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext, SYSTEM_CONTEXT } from '../../prisma/rls-context';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import {
  toTenantMembershipResponse,
  type TenantMembershipResponse,
} from './dto/tenant-membership.response';
import {
  toTenantPublicProfile,
  toTenantPublicSummary,
  type TenantPublicProfileResponse,
  type TenantPublicSummaryResponse,
} from './dto/tenant-public.response';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Création d'un espace en libre-service (onboarding, brief §6) : n'importe
   * quel compte authentifié peut créer le sien, et en devient automatiquement
   * propriétaire. Alignée sur la policy RLS `tenants_insert`
   * (`created_by = app_current_user_id()`) — aucun bypass platform_admin
   * nécessaire ici, un utilisateur ordinaire crée toujours son propre tenant.
   */
  async create(
    dto: CreateTenantDto,
    user: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TenantMembershipResponse> {
    const member = await this.prisma
      .withRlsContext(buildRlsContext(user), async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            type: dto.type,
            description: dto.description,
            status: 'active',
            createdBy: user.id,
          },
        });

        // Acceptation des conditions de distribution en vigueur pour ce type
        // de tenant, dans la même transaction que la création — jamais après
        // coup (mission plateforme de paiement, brief §17). `dto.acceptTerms`
        // est déjà garanti `true` par le DTO (`@Equals(true)`) ; si aucune
        // version n'est publiée pour ce type (ne devrait pas arriver — le
        // seed en pose une par type — mais un Superadmin pourrait en théorie
        // désactiver la dernière sans en republier une), la création n'est
        // pas bloquée pour autant : on ne peut pas faire accepter un texte
        // qui n'existe pas.
        const activeTerms = await tx.distributionTerms.findFirst({
          where: { tenantType: dto.type, isActive: true },
          orderBy: { version: 'desc' },
        });
        if (activeTerms) {
          await tx.tenantTermsAcceptance.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              termsId: activeTerms.id,
              ipAddress: ipAddress ?? null,
            },
          });
        }

        return tx.tenantMember.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'owner',
            status: 'active',
          },
          include: { tenant: true },
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'Cette adresse est déjà utilisée par un autre espace.',
          );
        }
        throw error;
      });

    return toTenantMembershipResponse(member);
  }

  /**
   * Appartenances de l'utilisateur courant, triées par ancienneté (la plus
   * ancienne d'abord) : c'est la règle déterministe de sélection du tenant
   * par défaut à la connexion (brief Phase 5 §5, câblée côté frontend dans
   * `TenantProvider`). Un membership `suspended` reste renvoyé — le
   * frontend doit pouvoir l'afficher grisé, pas le faire disparaître
   * silencieusement.
   */
  async listMemberships(
    user: AuthenticatedUser,
  ): Promise<TenantMembershipResponse[]> {
    const members = await this.prisma.withRlsContext(
      buildRlsContext(user),
      (tx) =>
        tx.tenantMember.findMany({
          where: { userId: user.id },
          include: { tenant: true },
          orderBy: { createdAt: 'asc' },
        }),
    );

    return members.map(toTenantMembershipResponse);
  }

  /**
   * Valide qu'un tenant demandé comme "actif" correspond bien à une
   * appartenance réelle et active de l'utilisateur courant — jamais une
   * confiance aveugle dans ce que le client envoie (brief Phase 5 §7).
   * Retourne `null` si la demande n'est pas valide : à l'appelant de refuser
   * plutôt que d'utiliser une valeur par défaut hasardeuse.
   */
  async validateActiveTenant(
    user: AuthenticatedUser,
    tenantId: string,
  ): Promise<TenantMembershipResponse | null> {
    const member = await this.prisma.withRlsContext(
      buildRlsContext(user),
      (tx) =>
        tx.tenantMember.findFirst({
          where: { userId: user.id, tenantId, status: 'active' },
          include: { tenant: true },
        }),
    );

    return member ? toTenantMembershipResponse(member) : null;
  }

  /**
   * Acceptation d'une invitation (Phase 8) : `TeamService.invite()` crée
   * désormais la ligne en `invited`, jamais `active` — la personne invitée
   * devient réellement membre ici, en acceptant elle-même, pas au moment où
   * quelqu'un d'autre l'a ajoutée. `userId = user.id` dans le `WHERE` garantit
   * qu'on ne peut accepter que sa propre invitation, jamais celle de
   * quelqu'un d'autre.
   */
  async acceptInvitation(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<TenantMembershipResponse> {
    const member = await this.prisma.withRlsContext(
      buildRlsContext(user),
      async (tx) => {
        const existing = await tx.tenantMember.findFirst({
          where: { tenantId, userId: user.id, status: 'invited' },
        });
        if (!existing) {
          throw new NotFoundException(
            'Aucune invitation en attente pour cet espace.',
          );
        }
        return tx.tenantMember.update({
          where: { id: existing.id },
          data: { status: 'active' },
          include: { tenant: true },
        });
      },
    );

    return toTenantMembershipResponse(member);
  }

  /**
   * Profil public d'un tenant (Phase 5, vitrine). Aucun contexte RLS posé,
   * comme `WorksService`/`AuthorsService` pour leurs lectures publiques : la
   * policy `tenants_select` porte elle-même la condition `status = 'active'`
   * qui autorise cette lecture anonyme (`20260823020000_add_rls_policies`,
   * ligne 76) — poser un contexte ici n'apporterait rien de plus.
   */
  async findPublicBySlug(slug: string): Promise<TenantPublicProfileResponse> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: 'active' },
    });

    if (!tenant) {
      throw new NotFoundException(
        "Cet espace n'existe pas ou n'est plus actif.",
      );
    }

    return toTenantPublicProfile(tenant);
  }

  /**
   * Annuaire public des espaces (maisons d'édition, auteurs indépendants…) —
   * jusqu'ici introuvable sans connaître déjà l'adresse exacte de sa vitrine
   * (`/tenants/public/:slug`). Même absence de RLS que `findPublicBySlug`
   * juste au-dessus : un visiteur anonyme doit pouvoir parcourir l'annuaire,
   * pas seulement ouvrir une fiche dont il a déjà le lien.
   */
  async listPublic(q?: string): Promise<TenantPublicSummaryResponse[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
      },
      select: {
        slug: true,
        name: true,
        type: true,
        description: true,
        logoPath: true,
      },
      orderBy: { name: 'asc' },
    });

    return tenants.map(toTenantPublicSummary);
  }

  /**
   * Répertoire complet des tenants pour un platform_admin — aucun équivalent
   * n'existait avant la plateforme de paiement (mission dédiée) : nécessaire
   * pour choisir un tenant précis lors de la création d'une règle de
   * commission ou de conditions de distribution qui lui sont propres. Appelée
   * uniquement depuis une route `@Roles('admin')` : pas de RLS ici, un
   * platform_admin voit tout, comme partout ailleurs dans le back-office.
   */
  async listAllForAdmin(
    search?: string,
  ): Promise<{ id: string; name: string; slug: string; type: TenantType }[]> {
    return this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.tenant.findMany({
        where: search
          ? { name: { contains: search, mode: 'insensitive' } }
          : undefined,
        select: { id: true, name: true, slug: true, type: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
  }
}
