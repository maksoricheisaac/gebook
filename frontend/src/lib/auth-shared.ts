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
