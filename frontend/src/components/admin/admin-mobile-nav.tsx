"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";

import {
  AdminNavLink,
  SETTINGS_NAV_ITEM,
  isAdminNavItemActive,
  useAdminNav,
} from "@/src/components/admin/admin-sidebar";
import { LogoLink } from "@/src/components/layout/logo";
import { TenantSwitcher } from "@/src/components/layout/tenant-switcher";
import { cn } from "@/src/lib/utils";

/**
 * Navigation du back-office, téléphone et tablette.
 *
 * `AdminSidebar` ne s'affiche plus qu'à partir de `lg` : le back-office compte
 * trop d'entrées (six, plus les paramètres, répartis en deux groupes) pour
 * tenir dans une bande horizontale sans que la moitié reste hors champ. Ici,
 * un bouton dans la topbar ouvre un panneau latéral qui reprend le même
 * contenu que la barre latérale — mêmes données (`useAdminNav`), mêmes liens
 * (`AdminNavLink`), pour que les deux ne puissent pas diverger.
 *
 * Portail vers `<body>` : voir le commentaire équivalent dans `MobileMenu`
 * (site public) — un ancêtre avec `backdrop-filter`, `transform` ou `filter`
 * changerait le containing block d'un élément `fixed` et casserait sa
 * position. Même stratégie de fermeture aussi : échap, clic sur le voile,
 * changement de page.
 */
export function AdminMobileNav({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [previousPathname, setPreviousPathname] = useState(pathname);
  const { ungroupedItems, groupedItems } = useAdminNav(isPlatformAdmin);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setIsOpen(false);
  }

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

  const close = (): void => setIsOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls="admin-menu-mobile"
        aria-label="Ouvrir le menu d’administration"
        className="text-muted-foreground hover:bg-muted hover:text-secondary grid size-9 cursor-pointer place-items-center rounded-md transition-colors duration-[var(--duration-fast)] lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>

      {mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" inert={!isOpen}>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer le menu"
              className={cn(
                "bg-ink-900/45 absolute inset-0 backdrop-blur-[2px]",
                "transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)]",
                isOpen ? "opacity-100" : "opacity-0",
              )}
            />

            <div
              id="admin-menu-mobile"
              role="dialog"
              aria-modal="true"
              aria-label="Menu d’administration"
              className={cn(
                "bg-sidebar text-sidebar-foreground shadow-overlay absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto",
                "transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)]",
                isOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <div className="border-sidebar-border flex items-center justify-between gap-2 border-b px-5 py-4">
                <LogoLink variant="plaque" className="h-7" />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fermer le menu"
                  className="text-sidebar-foreground/70 hover:bg-sidebar-accent/60 grid size-9 cursor-pointer place-items-center rounded-md transition-colors duration-[var(--duration-fast)]"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>

              <nav
                aria-label="Navigation de l’administration"
                className="flex flex-1 flex-col px-3 py-4"
              >
                <div className="mb-4 px-1">
                  <TenantSwitcher />
                </div>

                <ul className="space-y-1">
                  {ungroupedItems.map((item) => (
                    <li key={item.href}>
                      <AdminNavLink
                        item={item}
                        active={isAdminNavItemActive(pathname, item)}
                        onNavigate={close}
                      />
                    </li>
                  ))}
                </ul>

                {groupedItems.map((group) => (
                  <div key={group.name} className="mt-5">
                    <p className="type-label text-sidebar-foreground/40 mb-1.5 px-3">
                      {group.name}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <AdminNavLink
                            item={item}
                            active={isAdminNavItemActive(pathname, item)}
                            onNavigate={close}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="border-sidebar-border mt-auto border-t pt-3">
                  <ul>
                    <li>
                      <AdminNavLink
                        item={SETTINGS_NAV_ITEM}
                        active={isAdminNavItemActive(pathname, SETTINGS_NAV_ITEM)}
                        onNavigate={close}
                      />
                    </li>
                  </ul>
                </div>
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
