import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlatformDashboard } from "@/src/components/admin/platform-dashboard";
import { TenantDashboard } from "@/src/components/admin/tenant-dashboard";
import { requireAdminAccess } from "@/src/lib/auth";
import { fetchAuthors, fetchCategories, fetchWorks } from "@/src/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

/** Aligné sur `TENANT_FINANCE_ROLES` côté API (policy RLS `sale_distributions_select`). */
const FINANCE_ROLES = ["owner", "admin", "finance"];

/**
 * Tableau de bord de l'administration.
 *
 * Les chiffres de catalogue (page publique telle qu'elle apparaît) restent
 * résolus ici, côté serveur : ce sont des états actuels, pas des événements
 * datés, donc ils n'ont pas besoin de React Query ni de la période
 * sélectionnée. Les ventes et le graphe, eux, se recalculent avec la période
 * — c'est `PlatformDashboard`/`TenantDashboard` (composants client) qui s'en
 * chargent, chacun sur son propre point de terminaison.
 */
export default async function AdminDashboardPage() {
  const { user, isPlatformAdmin, activeTenant } = await requireAdminAccess();

  if (!isPlatformAdmin) {
    // Un membre owner/admin/finance de son tenant voit les ventes de SON
    // espace (brief §7, Tenant Dashboard) ; les autres rôles (editor, author,
    // marketing, viewer) n'ont rien à faire d'un tableau de chiffres qu'ils
    // n'ont pas le droit de voir — leur porte d'entrée reste Auteurs.
    if (activeTenant && FINANCE_ROLES.includes(activeTenant.role)) {
      return <TenantDashboard user={user} />;
    }
    redirect("/admin/auteurs");
  }

  const [published, featured, authors, categories] = await Promise.all([
    fetchWorks({ perPage: 1 }),
    fetchWorks({ featured: true, perPage: 1 }),
    fetchAuthors(),
    fetchCategories(),
  ]);

  const emptyCategories = categories.filter(
    (category) => category.workCount === 0,
  ).length;

  return (
    <PlatformDashboard
      user={user}
      catalog={{
        publishedWorks: published.meta.total,
        featuredWorks: featured.meta.total,
        authorsCount: authors.length,
        emptyCategories,
      }}
    />
  );
}
