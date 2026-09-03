import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { TenantSettingsManager } from "@/src/components/admin/tenant-settings-manager";
import { DangerZone } from "@/src/components/admin/danger-zone";
import { requireAdminAccess } from "@/src/lib/auth";

export const metadata: Metadata = {
  title: "Paramètres",
};

export default async function AdminTenantSettingsPage() {
  const { isPlatformAdmin } = await requireAdminAccess();

  return (
    <>
      <AdminPageHeader
        title="Paramètres de l’espace"
        description="Nom, description, site web, réseaux sociaux et images de marque de cet espace."
      />
      <TenantSettingsManager />

      {isPlatformAdmin && (
        <div className="mt-12">
          <DangerZone />
        </div>
      )}
    </>
  );
}
