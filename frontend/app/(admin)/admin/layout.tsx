import type { Metadata } from "next";

import { AdminShell } from "@/src/components/admin/admin-shell";
import { QueryProvider } from "@/src/components/providers/query-provider";
import { TenantProvider } from "@/src/components/providers/tenant-provider";
import { requireAdminAccess } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Administration GeBook" },
  robots: { index: false, follow: false },
};

/**
 * Coquille du back-office.
 *
 * Elle vit dans son propre groupe de routes `(admin)` : l'administration n'hérite
 * donc plus de l'en-tête marketing ni du pied de page de quatre colonnes du site
 * public. Une barre latérale sombre et pleine hauteur les remplace, avec sa
 * propre navigation et l'identité du compte connecté.
 *
 * Sur mobile la barre passe au-dessus du contenu et se réduit à une rangée
 * défilante — le back-office reste utilisable au téléphone sans devenir un menu
 * plein écran, puisqu'on y navigue en permanence entre les sections.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user, isPlatformAdmin, memberships, activeTenant } =
    await requireAdminAccess();

  return (
    <QueryProvider>
      <TenantProvider
        memberships={memberships}
        initialActiveTenantId={activeTenant?.tenantId ?? null}
      >
        <AdminShell user={user} isPlatformAdmin={isPlatformAdmin}>
          {children}
        </AdminShell>
      </TenantProvider>
    </QueryProvider>
  );
}
