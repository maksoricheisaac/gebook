import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { ProfileManager } from "@/src/components/admin/profile-manager";
import { requireAdminAccess } from "@/src/lib/auth";

export const metadata: Metadata = {
  title: "Profil",
};

export default async function AdminProfilePage() {
  const { user } = await requireAdminAccess();

  return (
    <>
      <AdminPageHeader
        title="Mon profil"
        description="Vos informations personnelles et votre mot de passe."
      />
      <ProfileManager user={user} />
    </>
  );
}
