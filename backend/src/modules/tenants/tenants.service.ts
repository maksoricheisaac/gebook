import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import {
  toTenantMembershipResponse,
  type TenantMembershipResponse,
} from './dto/tenant-membership.response';

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
}
