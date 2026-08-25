import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { OrderList } from "@/src/components/admin/order-list";
import { requireRole } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commandes",
};

/**
 * Une commande peut porter des lignes de plusieurs tenants (panier
 * multi-tenant) : elle n'appartient à aucun tenant unique, cette vue reste
 * réservée au superadmin — le lien n'apparaît déjà plus dans `AdminSidebar`
 * pour un membre de tenant.
 */
export default async function AdminOrdersPage() {
  await requireRole(["admin"], "/admin/commandes");

  return (
    <>
      <AdminPageHeader
        title="Commandes"
        description="Suivre les commandes des lecteurs et faire évoluer leur statut jusqu’à la remise."
      />
      <OrderList />
    </>
  );
}
