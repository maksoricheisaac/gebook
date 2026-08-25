"use client";

import { useEffect, useState } from "react";

import { AdminSidebar } from "@/src/components/admin/admin-sidebar";
import { AdminTopbar } from "@/src/components/admin/admin-topbar";
import { Toaster } from "@/src/components/ui/sonner";
import type { CurrentUser } from "@/src/lib/auth-shared";

const COLLAPSE_STORAGE_KEY = "gebook_admin_sidebar_collapsed";

/**
 * Coquille cliente du back-office : barre latérale (repliable), topbar,
 * contenu.
 *
 * L'état de repli vit ici plutôt que dans `AdminSidebar` parce que la largeur
 * de colonne de la grille doit changer avec lui — un composant qui ne
 * connaîtrait que sa propre largeur ne pourrait pas redimensionner la grille
 * qui le contient. Persisté en `localStorage` (pas en cookie) : c'est une
 * préférence d'affichage locale à l'appareil, pas une donnée qui doit
 * survivre au rendu serveur.
 */
export function AdminShell({
  user,
  isPlatformAdmin,
  children,
}: {
  user: CurrentUser;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Lecture ponctuelle d'un store externe (localStorage) au montage : le
    // rendu serveur ne peut pas connaître cette préférence, donc le premier
    // rendu client reste replié à `false` puis se corrige ici, une seule fois.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
  }, []);

  const toggleCollapsed = (): void => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div
      className="flex min-h-dvh flex-col lg:grid lg:items-start"
      style={{ gridTemplateColumns: collapsed ? "5rem minmax(0,1fr)" : "16rem minmax(0,1fr)" }}
    >
      <AdminSidebar isPlatformAdmin={isPlatformAdmin} collapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar user={user} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />

        <main id="contenu" className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
