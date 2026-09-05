/**
 * Liens de navigation, partagés entre `SiteHeader`, `MobileMenu` et `SiteFooter`.
 *
 * Sortis des composants : `SiteHeader` importe `MobileMenu`, donc si `MobileMenu`
 * avait importé cette constante depuis `site-header.tsx`, l'import circulaire
 * aurait rendu tout ce que `SiteHeader` importe — y compris `next/headers` via
 * `lib/auth.ts` — atteignable depuis le bundle client de `MobileMenu`.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Description courte, affichée dans le menu mobile. */
  hint?: string;
}

/** Navigation principale : la page d'accueil d'abord, puis la découverte du catalogue et l'institution. */
export const MAIN_NAVIGATION: NavItem[] = [
  { href: "/", label: "Accueil", hint: "Retour à la page d'accueil" },
  { href: "/livres", label: "Catalogue", hint: "Toutes les œuvres publiées" },
  { href: "/auteurs", label: "Auteurs", hint: "Les voix de GeBook" },
  { href: "/espaces", label: "Espaces", hint: "Maisons d'édition et collectifs" },
  { href: "/a-propos", label: "La plateforme", hint: "Notre mission" },
  { href: "/contact", label: "Contact", hint: "Nous écrire" },
];

/** Espace personnel du lecteur connecté. */
export const READER_NAVIGATION: NavItem[] = [
  { href: "/mon-espace", label: "Mon espace" },
  { href: "/mes-commandes", label: "Mes commandes" },
];

/**
 * Vrai si `pathname` se trouve dans la section `href`.
 *
 * Utilisé pour marquer le lien courant. La comparaison tient compte des
 * sous-pages (`/livres/mon-titre` allume bien « Catalogue ») sans qu'un préfixe
 * commun ne déborde : `/auteur` ne doit pas allumer `/auteurs`.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
