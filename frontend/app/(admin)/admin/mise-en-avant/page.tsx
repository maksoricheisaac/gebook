import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { FeaturedWorksManager } from "@/src/components/admin/featured-works-manager";

export const metadata: Metadata = {
  title: "Mise en avant",
};

export default function AdminFeaturedWorksPage() {
  return (
    <>
      <AdminPageHeader
        title="Mise en avant"
        description="Choisissez les œuvres publiées affichées en avant sur l’accueil, et leur ordre de priorité — réservé au SuperAdmin."
      />
      <FeaturedWorksManager />
    </>
  );
}
