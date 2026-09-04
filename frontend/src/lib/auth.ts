import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "./api";
import { destinationFor, resolveAccountLinks, type CurrentUser } from "./auth-shared";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import { resolveActiveTenant } from "./tenant";
import type { TenantMembership } from "./tenant-shared";

export { destinationFor, resolveAccountLinks };
export type { CurrentUser };

/**
 * Utilisateur courant, lu côté serveur.
 *
 * Un Server Component ne reçoit aucun cookie automatiquement : celui du visiteur est
 * lu ici puis retransmis explicitement à l'API, qui reste la seule à savoir si la
 * session est encore valide (compte bloqué entre-temps, session expirée…).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    return await apiFetch<CurrentUser>("/auth/me", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      revalidate: 0,
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      return null;
    }
    throw error;
  }
}

/** Redirige vers la connexion si personne n'est authentifié. */
export async function requireUser(retour?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(retour ? `/connexion?retour=${encodeURIComponent(retour)}` : "/connexion");
  }
  return user;
}

/**
 * Redirige vers la connexion si personne n'est authentifié, et vers l'espace lecteur
 * si le compte n'a aucun des rôles requis — un cumul de rôles suffit (règle métier n° 23).
 */
export async function requireRole(
  roles: string[],
  retour?: string,
): Promise<CurrentUser> {
  const user = await requireUser(retour);
  if (!roles.some((role) => user.roles.includes(role))) {
    redirect("/mon-espace");
  }
  return user;
}

/**
 * Destination après connexion/inscription, en tenant compte des adhésions de
 * tenant en plus des rôles globaux — un membre de tenant (owner/admin/editor…)
 * n'a que le rôle global `reader`, jamais `admin` (brief §7) : `destinationFor()`
 * seul ne peut donc pas le distinguer d'un lecteur ordinaire.
 */
export async function resolveDestination(roles: string[]): Promise<string> {
  const { memberships } = await resolveActiveTenant();
  return resolveAccountLinks(roles, memberships).destination;
}

export interface AdminAccess {
  user: CurrentUser;
  /** Rôle plateforme (`admin`) — distinct du rôle de tenant porté par `activeTenant`. */
  isPlatformAdmin: boolean;
  memberships: TenantMembership[];
  activeTenant: TenantMembership | null;
}

/**
 * Porte d'entrée du back-office (`(admin)/layout.tsx`) : un platform_admin
 * passe toujours, un membre de tenant passe s'il a au moins un espace actif,
 * n'importe qui d'autre repart vers l'espace lecteur. La protection réelle des
 * données reste RLS + `TenantAccessGuard` côté API — ceci ne fait qu'éviter
 * d'afficher un back-office à quelqu'un qui n'y a stricement rien à faire.
 */
export async function requireAdminAccess(retour = "/admin"): Promise<AdminAccess> {
  const user = await requireUser(retour);
  const isPlatformAdmin = user.roles.includes("admin");
  const { memberships, activeTenant } = await resolveActiveTenant();

  if (!isPlatformAdmin && memberships.length === 0) {
    redirect("/mon-espace");
  }

  return { user, isPlatformAdmin, memberships, activeTenant };
}
