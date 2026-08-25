import { cookies } from "next/headers";
import { apiFetch, ApiError } from "./api";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import {
  ACTIVE_TENANT_COOKIE_NAME,
  pickActiveTenant,
  type TenantMembership,
} from "./tenant-shared";

export { ACTIVE_TENANT_COOKIE_NAME, pickActiveTenant };
export type { TenantMembership };

/**
 * Adhésions réelles de l'utilisateur courant, lues côté serveur.
 *
 * Miroir de `getCurrentUser()` (`auth.ts`) : un visiteur non authentifié n'a
 * aucune adhésion, sans que ce soit une erreur.
 */
export async function getTenantMemberships(): Promise<TenantMembership[]> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return [];
  }

  try {
    return await apiFetch<TenantMembership[]>("/tenants/me", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      revalidate: 0,
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      return [];
    }
    throw error;
  }
}

/**
 * Choix du tenant actif tel que persisté par le visiteur, avant toute
 * validation. Une simple préférence d'affichage — jamais une preuve
 * d'autorisation : c'est `resolveActiveTenant()` qui la confronte aux
 * véritables adhésions avant de la retenir.
 */
export async function getPersistedActiveTenantId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_TENANT_COOKIE_NAME)?.value ?? null;
}

/**
 * Adhésions et tenant actif résolus pour le rendu serveur d'une coquille
 * tenant-scoped (ex. `app/(site)/auteur/layout.tsx`), en un seul appel.
 */
export async function resolveActiveTenant(): Promise<{
  memberships: TenantMembership[];
  activeTenant: TenantMembership | null;
}> {
  const [memberships, persisted] = await Promise.all([
    getTenantMemberships(),
    getPersistedActiveTenantId(),
  ]);

  return { memberships, activeTenant: pickActiveTenant(memberships, persisted) };
}
