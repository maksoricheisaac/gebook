import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { WorkList } from "@/src/components/admin/work-list";

export const metadata: Metadata = {
  title: "Œuvres",
};

export default function AdminWorksPage() {
  return (
    <>
      <AdminPageHeader
        title="Œuvres"
        description="Créer, publier et retirer les ouvrages du catalogue. Les formats et les prix se gèrent dans la fiche de chaque œuvre."
      />
      <WorkList />
    </>
  );
}
