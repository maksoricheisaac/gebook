"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  LayoutDashboard,
  Library,
  LogOut,
  Receipt,
  Wallet,
} from "lucide-react";

import { logoutAction } from "@/src/lib/auth-actions";
import { isActivePath } from "@/src/components/layout/navigation";
import { cn } from "@/src/lib/utils";

const ITEMS = [
  { href: "/mon-espace", label: "Vue d’ensemble", icon: LayoutDashboard },
  { href: "/bibliotheque", label: "Ma bibliothèque", icon: Library },
  { href: "/mes-commandes", label: "Mes commandes", icon: Receipt },
] as const;

/**
 * Navigation de l'espace lecteur.
 *
 * Composant client pour marquer la page courante — c'est la question à laquelle
 * l'espace précédent ne répondait jamais : on arrivait sur « Mon espace » ou
 * « Mes commandes » sans qu'aucun élément ne dise où l'on se trouvait ni ce
 * qu'on pouvait faire d'autre.
 *
 * En colonne sur grand écran, en rangée défilante sur mobile. La déconnexion est
 * séparée par un filet : c'est une action de sortie, pas une destination.
 */
export function AccountNav({
  hasTenantAccess = false,
  isAuthor = false,
}: {
  /** Vrai si le compte appartient à au moins un espace éditeur actif (brief §7). */
  hasTenantAccess?: boolean;
  /** Rôle global `author` — donne accès au suivi de revenus historique. */
  isAuthor?: boolean;
}) {
  const pathname = usePathname();

  const items = [
    ...ITEMS,
    ...(hasTenantAccess
      ? [{ href: "/admin" as const, label: "Mon espace éditeur", icon: Landmark }]
      : []),
    ...(isAuthor
      ? [
          {
            href: "/auteur/tableau-de-bord" as const,
            label: "Mes revenus d’auteur",
            icon: Wallet,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Navigation de mon espace" className="min-w-0 lg:sticky lg:top-24">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium whitespace-nowrap",
                  "transition-colors duration-[--duration-fast]",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-secondary",
                )}
              >
                <item.icon aria-hidden className="size-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <form
        action={logoutAction}
        className="border-border mt-3 hidden border-t pt-3 lg:block"
      >
        <button
          type="submit"
          className="text-muted-foreground hover:bg-destructive-muted hover:text-destructive flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors duration-[--duration-fast]"
        >
          <LogOut aria-hidden className="size-4 shrink-0" />
          Se déconnecter
        </button>
      </form>
    </nav>
  );
}
