import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { PaymentProvidersManager } from "@/src/components/admin/payment-providers-manager";
import { requireRole } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiements",
};

export default async function AdminPaymentsSettingsPage() {
  await requireRole(["admin"], "/admin/paiements");

  return (
    <>
      <AdminPageHeader
        title="Paiements"
        description="Prestataires de paiement et de reversement disponibles. Les secrets vivent uniquement dans la configuration serveur — cette page ne fait que refléter leur présence, jamais leur valeur."
      />
      <PaymentProvidersManager />
    </>
  );
}
