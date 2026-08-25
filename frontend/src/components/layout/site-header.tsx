import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { destinationFor, getCurrentUser } from "@/src/lib/auth";
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

  return (
    <header className="border-border bg-background/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center gap-4 px-5 sm:px-8">
        <LogoLink priority className="h-9 sm:h-10" />

        <div className="mx-auto hidden lg:block">
          <MainNav />
        </div>

        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <SearchField className="hidden w-56 xl:block xl:w-64" />

          {user ? (
            <UserMenu user={user} destination={destinationFor(user.roles)} />
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

          <MobileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
