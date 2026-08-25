import type { AuthenticatedUser } from '../modules/auth/auth.types';

/**
 * Contexte transmis aux policies RLS PostgreSQL (Phase 4,
 * `20260823020000_add_rls_policies`) via `PrismaService.withRlsContext()` /
 * `applyRlsContext()`.
 *
 * `tenantId` est `null` tant qu'aucune résolution réelle du tenant actif
 * n'existe (Phase 5 — `TenantContext`). Cela ne réduit pas la sécurité : les
 * policies qui exigent une appartenance tenant refusent simplement l'accès
 * quand `tenantId` est `null`, exactement comme pour un visiteur anonyme.
 */
export interface RlsContext {
  userId: string | null;
  tenantId: string | null;
  isPlatformAdmin: boolean;
}

/** Aucun utilisateur, aucun tenant : visite anonyme du catalogue public. */
export const PUBLIC_CONTEXT: RlsContext = {
  userId: null,
  tenantId: null,
  isPlatformAdmin: false,
};

/**
 * Traitement système de confiance (webhook de paiement vérifié par signature
 * HMAC, tâche interne) : aucun utilisateur authentifié, mais une autorité
 * équivalente à un platform_admin pour les écritures que ce traitement doit
 * légitimement faire (voir le commentaire de `payments.service.ts`).
 */
export const SYSTEM_CONTEXT: RlsContext = {
  userId: null,
  tenantId: null,
  isPlatformAdmin: true,
};

/**
 * Contexte d'un utilisateur authentifié. `tenantId` reste `null` par défaut :
 * les sites d'appel qui connaissent déjà le tenant concerné (ex. un service
 * qui vient de dériver le tenant d'une œuvre) le renseignent explicitement.
 */
export function buildRlsContext(
  user: AuthenticatedUser,
  tenantId: string | null = null,
): RlsContext {
  return {
    userId: user.id,
    tenantId,
    isPlatformAdmin: user.roles.includes('admin'),
  };
}
