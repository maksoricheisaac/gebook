import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { AuthorManager } from "@/src/components/admin/author-manager";

export const metadata: Metadata = {
  title: "Auteurs",
};

export default function AdminAuthorsPage() {
  return (
    <>
      <AdminPageHeader
        title="Auteurs"
        description="Les fiches auteur alimentent la page publique des auteurs et la signature de chaque ouvrage."
      />
      <AuthorManager />
    </>
  );
}
