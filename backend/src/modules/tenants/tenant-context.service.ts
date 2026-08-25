import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { TenantContext } from './tenant-context';

/**
 * Résout le tenant réellement actif pour la requête en cours, à partir du cookie
 * `gebook_active_tenant` (préférence non authentifiante — `active-tenant-cookie.ts`).
 *
 * Deux chemins distincts, jamais mélangés :
 * - platform_admin : peut sélectionner n'importe quel tenant EXISTANT, membre ou
 *   non — cohérent avec le bypass RLS déjà accordé à ce rôle partout ailleurs.
 * - membre de tenant : le cookie n'est retenu QUE s'il correspond à une
 *   adhésion `active` réelle ; sinon on retombe sur la même règle par défaut
 *   que le frontend (`pickActiveTenant`, `tenant-shared.ts` — adhésion la plus
 *   ancienne), jamais un refus pur et simple. Sans ce repli, un membre d'un
 *   seul tenant resterait bloqué en permanence : `TenantSwitcher` (le seul
 *   endroit qui pose ce cookie) s'auto-masque justement quand il n'y a qu'une
 *   seule adhésion — constaté en testant ce module dans un vrai navigateur.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    user: AuthenticatedUser,
    activeTenantCookieValue: string | undefined,
  ): Promise<TenantContext> {
    const isPlatformAdmin = user.roles.includes('admin');

    if (isPlatformAdmin) {
      if (!activeTenantCookieValue) {
        return { tenantId: null, role: null, isPlatformAdmin: true };
      }
      const tenant = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.tenant.findUnique({
          where: { id: activeTenantCookieValue },
          select: { id: true },
        }),
      );
      return {
        tenantId: tenant?.id ?? null,
        role: null,
        isPlatformAdmin: true,
      };
    }

    const memberships = await this.prisma.withRlsContext(
      { userId: user.id, tenantId: null, isPlatformAdmin: false },
      (tx) =>
        tx.tenantMember.findMany({
          where: { userId: user.id, status: 'active' },
          select: { tenantId: true, role: true },
          orderBy: { createdAt: 'asc' },
        }),
    );

    if (memberships.length === 0) {
      return { tenantId: null, role: null, isPlatformAdmin: false };
    }

    const chosen =
      (activeTenantCookieValue &&
        memberships.find((m) => m.tenantId === activeTenantCookieValue)) ||
      memberships[0];

    return {
      tenantId: chosen.tenantId,
      role: chosen.role,
      isPlatformAdmin: false,
    };
  }
}
