import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { PayoutsManager } from "@/src/components/admin/payouts-manager";
import { requireAdminAccess } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retraits",
};

/** Aligné sur `TENANT_FINANCE_ROLES` côté API. */
const FINANCE_ROLES = ["owner", "admin", "finance"];

export default async function AdminPayoutsPage() {
  const { isPlatformAdmin, activeTenant } = await requireAdminAccess("/admin/retraits");

  if (!isPlatformAdmin && !(activeTenant && FINANCE_ROLES.includes(activeTenant.role))) {
    redirect("/admin/auteurs");
  }

  return (
    <>
      <AdminPageHeader
        title="Retraits"
        description={
          isPlatformAdmin
            ? "Approuvez, refusez ou marquez comme payées les demandes de retrait des espaces."
            : "Demandez le retrait de votre solde disponible et suivez son traitement."
        }
      />
      <PayoutsManager isPlatformAdmin={isPlatformAdmin} />
    </>
  );
}
