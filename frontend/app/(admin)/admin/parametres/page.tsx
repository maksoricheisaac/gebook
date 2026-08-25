import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { TenantSettingsManager } from "@/src/components/admin/tenant-settings-manager";

export const metadata: Metadata = {
  title: "Paramètres",
};

export default function AdminTenantSettingsPage() {
  return (
    <>
      <AdminPageHeader
        title="Paramètres de l’espace"
        description="Nom, description, site web, réseaux sociaux et images de marque de cet espace."
      />
      <TenantSettingsManager />
    </>
  );
}
