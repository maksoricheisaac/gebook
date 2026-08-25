"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Receipt, User } from "lucide-react";

import { logoutAction } from "@/src/lib/auth-actions";
import type { CurrentUser } from "@/src/lib/auth-shared";
import { cn } from "@/src/lib/utils";

/*
 * Menu du compte, sur grand écran.
 *
 * Il remplace les deux boutons « Bonjour, Prénom » et « Déconnexion » posés côte
 * à côte dans l'en-tête : la déconnexion y avait le même poids visuel que
 * l'accès au compte, alors que c'est l'action qu'on déclenche le moins souvent
 * et la seule qu'on regrette.
 *
 * Composant client parce qu'il porte un état d'ouverture. La déconnexion reste
 * un `<form>` qui appelle une Server Action : elle fonctionne même si ce menu
 * n'est jamais hydraté.
 */
export function UserMenu({
  user,
  destination,
}: {
  user: CurrentUser;
  destination: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Un menu qui ne se referme ni au clic extérieur ni à Échap est un piège :
  // il recouvre la page et ne laisse aucune sortie au clavier.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const initial = user.firstName.trim().charAt(0).toUpperCase() || "?";
  const isAdmin = user.roles.includes("admin");

  return (
    <div ref={container} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          "border-border-strong bg-card flex h-10 cursor-pointer items-center gap-2 rounded-md border pr-2 pl-1.5",
          "text-secondary text-sm font-medium transition-colors duration-[--duration-fast]",
          "hover:bg-muted focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden
          className="bg-secondary text-secondary-foreground grid size-7 place-items-center rounded-sm text-xs font-semibold"
        >
          {initial}
        </span>
        <span className="max-w-24 truncate">{user.firstName}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "text-muted-foreground size-4 transition-transform duration-[--duration-fast]",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="border-border bg-popover shadow-overlay absolute top-full right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border"
        >
          <div className="border-border border-b px-3.5 py-3">
            <p className="text-secondary truncate text-sm font-semibold">
              {user.firstName} {user.lastName ?? ""}
            </p>
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          </div>

          <div className="p-1.5">
            {isAdmin && (
              <MenuLink href="/admin" icon={LayoutDashboard}>
                Administration
              </MenuLink>
            )}
            <MenuLink href={destination} icon={User}>
              Mon espace
            </MenuLink>
            <MenuLink href="/mes-commandes" icon={Receipt}>
              Mes commandes
            </MenuLink>
          </div>

          <form action={logoutAction} className="border-border border-t p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="text-muted-foreground hover:bg-destructive-muted hover:text-destructive flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[--duration-fast]"
            >
              <LogOut aria-hidden className="size-4" />
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="text-secondary hover:bg-muted flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[--duration-fast]"
    >
      <Icon aria-hidden className="text-muted-foreground size-4" />
      {children}
    </Link>
  );
}
