import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { CommissionRuleManager } from "@/src/components/admin/commission-rule-manager";
import { requireRole } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commissions",
};

export default async function AdminCommissionsPage() {
  await requireRole(["admin"], "/admin/commissions");

  return (
    <>
      <AdminPageHeader
        title="Commissions"
        description="Les règles décident de la part prélevée par GeBook sur chaque vente. Elles ne s’appliquent qu’aux ventes à venir."
      />
      <CommissionRuleManager />
    </>
  );
}
