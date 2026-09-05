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
        description="Choisissez les œuvres publiées ET de visibilité publique à afficher en avant sur l’accueil, et leur ordre de priorité — réservé au SuperAdmin. Une œuvre réservée à un espace (« tenant_only ») ou privée n’apparaît pas ici : elle ne pourrait de toute façon jamais s’afficher sur l’accueil public."
      />
      <FeaturedWorksManager />
    </>
  );
}
