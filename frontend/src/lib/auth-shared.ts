/**
 * Types et fonctions pures partagés entre code serveur et composants client.
 *
 * Séparés de `auth.ts` pour une seule raison : `auth.ts` importe `next/headers`, que
 * Next.js refuse de voir atteindre un composant client, même transitivement via un
 * simple import de valeur. Ce fichier n'importe rien de tel — un composant client
 * comme `MobileMenu` peut donc s'en servir sans risque.
 */

export interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  roles: string[];
}

/** Sous-ensemble de `TenantMembership` (`tenant-shared.ts`) réellement lu ici. */
interface MembershipStatus {
  status: "active" | "invited" | "suspended";
}

/** Destination après connexion ou inscription, comme dans la version PHP. */
export function destinationFor(roles: string[]): string {
  if (roles.includes("admin")) {
    return "/admin";
  }
  if (roles.includes("author")) {
    return "/auteur/tableau-de-bord";
  }
  return "/mon-espace";
}

export interface AccountLinks {
  /** Cible du lien « Mon espace » du menu de compte. */
  destination: string;
  /**
   * Accès direct à la gestion des œuvres, sans repasser par le tableau de
   * bord — seulement pour un membre de tenant (pas un platform_admin, qui a
   * déjà « Administration ») ayant un espace actif : c'est lui qui n'avait
   * jusqu'ici aucun raccourci vers son propre catalogue depuis l'en-tête.
   */
  worksHref: string | null;
}

/**
 * Liens du menu de compte, dérivés des rôles globaux ET des adhésions de
 * tenant — même distinction que `resolveDestination()` (`auth.ts`) : un
 * membre de tenant (owner/admin/editor…) n'a que le rôle global `reader`,
 * jamais `admin` (brief §7), donc `destinationFor()` seul l'enverrait à tort
 * vers `/mon-espace` au lieu de son espace de gestion.
 *
 * Fonction pure (pas de `next/headers`) : `SiteHeader` la calcule une fois,
 * côté serveur, à partir des adhésions déjà résolues par
 * `resolveActiveTenant()`, puis transmet le résultat à `UserMenu` ET
 * `MobileMenu` — une seule source de vérité pour les deux, qui dupliquaient
 * chacun leur propre appel à `destinationFor()` avant ce correctif.
 */
export function resolveAccountLinks(
  roles: string[],
  memberships: MembershipStatus[],
): AccountLinks {
  if (roles.includes("admin")) {
    return { destination: "/admin", worksHref: null };
  }
  if (memberships.some((membership) => membership.status === "active")) {
    return { destination: "/admin", worksHref: "/admin/oeuvres" };
  }
  return { destination: destinationFor(roles), worksHref: null };
}
