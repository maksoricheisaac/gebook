/**
 * Types et fonctions pures du contexte tenant, partagés entre code serveur et
 * composants client.
 *
 * Séparé de `tenant.ts` pour la même raison que `auth-shared.ts` est séparé de
 * `auth.ts` : `tenant.ts` importe `next/headers`, que Next.js refuse de voir
 * atteindre un composant client, même transitivement. `TenantProvider` et
 * `useTenant()` n'importent donc que ce fichier.
 */

export type TenantMemberRole =
  | "owner"
  | "admin"
  | "editor"
  | "author"
  | "marketing"
  | "finance"
  | "viewer";

export type TenantMemberStatus = "active" | "invited" | "suspended";

export type TenantType =
  | "independent_author"
  | "publishing_house"
  | "collective"
  | "cultural_organization";

/** Miroir de `TenantMembershipResponse` (API, `GET /tenants/me`). */
export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: TenantType;
  role: TenantMemberRole;
  status: TenantMemberStatus;
  memberSince: string;
}

/**
 * Nom du cookie qui persiste le tenant actif côté client — doit rester
 * identique à `ACTIVE_TENANT_COOKIE_NAME` côté API
 * (`src/modules/tenants/active-tenant-cookie.ts`). Il ne sert jamais de preuve
 * d'autorisation : seule une bascule validée par `POST /tenants/me/active`
 * (RLS et véritables adhésions) peut le faire changer.
 */
export const ACTIVE_TENANT_COOKIE_NAME = "gebook_active_tenant";

/**
 * Règle de sélection du tenant actif par défaut (brief Phase 5) : le tenant
 * persisté s'il correspond toujours à une adhésion active, sinon la plus
 * ancienne adhésion — l'API trie déjà `GET /tenants/me` par `createdAt`
 * croissant, donc `memberships[0]` est le premier tenant rejoint.
 */
export function pickActiveTenant(
  memberships: TenantMembership[],
  persistedTenantId: string | null,
): TenantMembership | null {
  if (memberships.length === 0) {
    return null;
  }

  if (persistedTenantId) {
    const persisted = memberships.find((m) => m.tenantId === persistedTenantId);
    if (persisted) {
      return persisted;
    }
  }

  return memberships[0] ?? null;
}
