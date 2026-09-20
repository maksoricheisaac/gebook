import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { CommissionRuleManager } from "@/src/components/admin/commission-rule-manager";
import { EconomicSettingsManager } from "@/src/components/admin/economic-settings-manager";
import { requireRole } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modèle économique",
};

export default async function AdminEconomicModelPage() {
  await requireRole(["admin"], "/admin/modele-economique");

  return (
    <>
      <AdminPageHeader
        title="Modèle économique"
        description="Commissions, retraits des auteurs et simulateur de répartition — tout ce qui définit comment GeBook et les auteurs se partagent une vente."
      />
      <div className="space-y-10">
        <EconomicSettingsManager />
        <CommissionRuleManager />
      </div>
    </>
  );
}
