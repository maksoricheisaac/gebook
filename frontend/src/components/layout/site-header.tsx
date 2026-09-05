import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { getCurrentUser, resolveAccountLinks } from "@/src/lib/auth";
import { resolveActiveTenant } from "@/src/lib/tenant";
import { CartLink } from "./cart-link";
import { LogoLink } from "./logo";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";
import { SearchField } from "./search-field";
import { UserMenu } from "./user-menu";

/**
 * En-tête du site public.
 *
 * Composant serveur asynchrone : il lit l'utilisateur courant pour adapter son
 * état, sans qu'aucune interaction ne soit nécessaire. Seuls le menu mobile, la
 * recherche et le marquage du lien courant sont des composants client — chacun
 * pour une raison précise, énoncée dans son fichier.
 *
 * La barre de contacts sombre qui surmontait l'en-tête a disparu : elle donnait
 * un ton de site institutionnel et poussait la navigation vers le bas de l'écran.
 * Le téléphone et l'adresse restent accessibles, dans le pied de page et sur
 * `/contact`, où on les cherche réellement.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  // Un seul appel à `resolveActiveTenant()` pour tout l'en-tête : `UserMenu`
  // (grand écran) et `MobileMenu` en ont chacun besoin, mais la dupliquer
  // aurait fini par diverger silencieusement entre les deux, comme
  // `destinationFor()` seul l'avait fait pour un membre de tenant avant ce
  // correctif (voir `resolveAccountLinks`, `auth-shared.ts`).
  const { memberships } = user ? await resolveActiveTenant() : { memberships: [] };
  const accountLinks = user ? resolveAccountLinks(user.roles, memberships) : null;

  return (
    <header className="border-border bg-background/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        {/*
         * `justify-between` sur la rangée : sous `lg`, le bloc `MainNav`
         * ci-dessous est en `display: none` — il ne compte plus du tout dans
         * la répartition flex, et rien d'autre ne poussait plus les actions
         * (panier, menu) vers la droite. Logo et actions se retrouvaient
         * collés l'un à l'autre à gauche, tout l'espace restant vide à
         * droite. `justify-between` les écarte aux deux extrémités sur
         * mobile ; à `lg` et au-delà, `flex-1` sur `MainNav` absorbe déjà
         * tout l'espace libre restant, donc `justify-between` n'a plus rien
         * à redistribuer et ne change rien à ce comportement.
         */}
        <LogoLink priority className="h-9 sm:h-10" />

        {/*
         * `flex-1` + `justify-center`, pas `mx-auto` : avec `ml-auto` sur le
         * bloc d'actions à droite, les deux marges automatiques se
         * partageaient le même espace libre — plus `MainNav` gagnait de
         * liens, plus cet espace libre rétrécissait, resserrant toute la
         * rangée au lieu de laisser la nav respirer. `flex-1` lui garantit
         * toute la place restante entre le logo et les actions, quel que
         * soit son nombre de liens.
         */}
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <MainNav />
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:gap-3">
          <SearchField className="hidden w-56 xl:block xl:w-64" />

          <CartLink />

          {user && accountLinks ? (
            <UserMenu
              user={user}
              destination={accountLinks.destination}
              worksHref={accountLinks.worksHref}
            />
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Button asChild variant="ghost">
                <Link href="/connexion">Connexion</Link>
              </Button>
              <Button asChild>
                <Link href="/inscription">Créer un compte</Link>
              </Button>
            </div>
          )}

          <MobileMenu
            user={user}
            destination={accountLinks?.destination}
            worksHref={accountLinks?.worksHref ?? null}
          />
        </div>
      </div>
    </header>
  );
}
