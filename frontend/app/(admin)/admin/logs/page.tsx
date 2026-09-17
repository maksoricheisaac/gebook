import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { ActivityLogManager } from "@/src/components/admin/activity-log-manager";
import { requireAdminAccess } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'activité",
};

export default async function AdminLogsPage() {
  const { isPlatformAdmin } = await requireAdminAccess("/admin/logs");

  return (
    <>
      <AdminPageHeader
        title="Journal d'activité"
        description={
          isPlatformAdmin
            ? "Toutes les actions sensibles de la plateforme, tous espaces confondus."
            : "Les actions sensibles de votre espace : création, modification, suppression, commandes."
        }
      />
      <ActivityLogManager isPlatformAdmin={isPlatformAdmin} />
    </>
  );
}
