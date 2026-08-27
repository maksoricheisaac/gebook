"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from "lucide-react";

import { AdminMobileNav } from "@/src/components/admin/admin-mobile-nav";
import { logoutAction } from "@/src/lib/auth-actions";
import type { CurrentUser } from "@/src/lib/auth-shared";
import { cn } from "@/src/lib/utils";

/**
 * Barre supérieure du back-office.
 *
 * Porte deux choses qui n'ont pas leur place dans la navigation latérale :
 * le bouton qui réduit/agrandit la barre (une action de mise en page, pas de
 * navigation) et l'identité du compte connecté, seule sortie vers le site
 * public et la déconnexion sur toutes les tailles d'écran — la barre latérale
 * n'a donc plus besoin de dupliquer ces deux sorties pour le mobile.
 */
export function AdminTopbar({
  user,
  isPlatformAdmin,
  collapsed,
  onToggleCollapse,
}: {
  user: CurrentUser;
  isPlatformAdmin: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

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

  return (
    <header className="border-border bg-card sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b px-5 sm:px-8">
      <AdminMobileNav isPlatformAdmin={isPlatformAdmin} />

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={
          collapsed ? "Agrandir la barre latérale" : "Réduire la barre latérale"
        }
        className={cn(
          "text-muted-foreground hover:bg-muted hover:text-secondary hidden cursor-pointer place-items-center rounded-md",
          "size-9 transition-colors duration-[--duration-fast] lg:grid",
          "focus-visible:ring-ring/40 outline-none focus-visible:ring-[3px]",
        )}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="size-4" />
        ) : (
          <PanelLeftClose aria-hidden className="size-4" />
        )}
      </button>

      <div className="flex-1" />

      <div ref={container} className="relative">
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
          <span className="hidden max-w-32 truncate sm:inline">{user.firstName}</span>
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
            className="border-border bg-popover shadow-overlay absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border"
          >
            <div className="border-border border-b px-3.5 py-3">
              <p className="text-secondary truncate text-sm font-semibold">
                {user.firstName} {user.lastName ?? ""}
              </p>
              <p className="text-muted-foreground truncate text-xs">{user.email}</p>
            </div>

            <div className="p-1.5">
              <Link
                href="/admin/profil"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="text-secondary hover:bg-muted flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[--duration-fast]"
              >
                <UserRound aria-hidden className="text-muted-foreground size-4" />
                Mon profil
              </Link>
              <Link
                href="/"
                role="menuitem"
                className="text-secondary hover:bg-muted flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[--duration-fast]"
              >
                <Home aria-hidden className="text-muted-foreground size-4" />
                Retour au site public
              </Link>
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
    </header>
  );
}
