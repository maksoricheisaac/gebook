import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { CategoryManager } from "@/src/components/admin/category-manager";
import { requireRole } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catégories",
};

/**
 * Ressource plateforme (taxonomie globale, pas de `tenantId`) : réservée au
 * superadmin, y compris pour un membre de tenant qui atteindrait cette page
 * par URL directe — le lien n'apparaît déjà plus dans `AdminSidebar`.
 */
export default async function AdminCategoriesPage() {
  await requireRole(["admin"], "/admin/categories");

  return (
    <>
      <AdminPageHeader
        title="Catégories"
        description="Les domaines du catalogue. Un domaine sans ouvrage n’apparaît pas sur l’accueil."
      />
      <CategoryManager />
    </>
  );
}
