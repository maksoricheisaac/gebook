"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { logoutAction } from "@/src/lib/auth-actions";
import { destinationFor, type CurrentUser } from "@/src/lib/auth-shared";
import { isActivePath, MAIN_NAVIGATION, READER_NAVIGATION } from "./navigation";
import { SearchField } from "./search-field";
import { cn } from "@/src/lib/utils";

/*
 * Navigation mobile.
 *
 * Un panneau plein écran plutôt que le petit tiroir précédent : sur un
 * téléphone, la navigation est une étape à part entière, pas une incrustation.
 * Chaque entrée fait 56 px de haut et porte sa description — bien au-delà des
 * 44 px de cible tactile exigés.
 *
 * Composant client parce qu'il porte un état d'ouverture. C'est la seule raison :
 * la lecture de l'utilisateur reste faite côté serveur et lui arrive en prop.
 */
export function MobileMenu({ user }: { user: CurrentUser | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [previousPathname, setPreviousPathname] = useState(pathname);

  // `document.body` n'existe pas côté serveur : le portail n'est monté
  // qu'une fois le composant hydraté côté client. useSyncExternalStore plutôt
  // qu'un effet + setState : rien à souscrire, seul l'instantané diffère
  // entre serveur (false) et client (true).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Un changement de page doit refermer le panneau, sinon il reste ouvert
  // par-dessus le contenu demandé. Ajusté pendant le rendu plutôt que dans un
  // effet : c'est le cas où React recommande explicitement d'éviter l'effet.
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setIsOpen(false);
  }

  // Le panneau couvre l'écran : laisser la page défiler derrière lui donne
  // l'impression que le menu « glisse » alors qu'on croit faire défiler le menu.
  // Échap doit toujours pouvoir le refermer.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="menu-mobile"
        aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
      >
        {isOpen ? (
          <X aria-hidden className="size-5" />
        ) : (
          <Menu aria-hidden className="size-5" />
        )}
      </Button>

      {/*
       * Portail vers <body> : <header> a un fond flouté (backdrop-blur), ce
       * qui en fait un containing block CSS pour tout descendant en position
       * fixed. Rendu ici, le panneau (fixed, top-18, bottom-0) se calait donc
       * sur les 72px du header plutôt que sur le viewport — hauteur nulle,
       * invisible sur téléphone et tablette.
       */}
      {mounted &&
        createPortal(
          <div
            id="menu-mobile"
            inert={!isOpen}
            className={cn(
              "bg-background fixed inset-x-0 top-18 bottom-0 z-40 overflow-y-auto overscroll-contain",
              "transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]",
              isOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            )}
          >
            <div className="flex min-h-full flex-col px-5 pt-5 pb-10 sm:px-8">
              <SearchField size="lg" onSubmitted={() => setIsOpen(false)} />

              <nav aria-label="Navigation principale" className="mt-6">
                <ul className="divide-border divide-y">
                  {MAIN_NAVIGATION.map((item) => {
                    const active = isActivePath(pathname, item.href);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className="flex min-h-14 flex-col justify-center gap-0.5 py-3"
                        >
                          <span
                            className={cn(
                              "type-h3",
                              active ? "text-primary" : "text-secondary",
                            )}
                          >
                            {item.label}
                          </span>
                          {item.hint && <span className="type-caption">{item.hint}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="border-border mt-auto border-t pt-6">
                {user ? (
                  <div className="space-y-3">
                    <p className="type-label text-muted-foreground">
                      {user.firstName} {user.lastName ?? ""}
                    </p>

                    <div className="grid gap-2">
                      {user.roles.includes("admin") && (
                        <Button asChild variant="secondary" size="lg">
                          <Link href="/admin">Administration</Link>
                        </Button>
                      )}
                      <Button asChild variant="outline" size="lg">
                        <Link href={destinationFor(user.roles)}>Mon espace</Link>
                      </Button>
                      {READER_NAVIGATION.filter(
                        (item) => item.href !== "/mon-espace",
                      ).map((item) => (
                        <Button key={item.href} asChild variant="outline" size="lg">
                          <Link href={item.href}>{item.label}</Link>
                        </Button>
                      ))}
                    </div>

                    <form action={logoutAction}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="lg"
                        className="text-muted-foreground w-full"
                      >
                        <LogOut aria-hidden />
                        Se déconnecter
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    <Button asChild size="lg">
                      <Link href="/inscription">Créer un compte</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link href="/connexion">Se connecter</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
