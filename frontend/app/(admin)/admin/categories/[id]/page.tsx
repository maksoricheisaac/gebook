import type { Metadata } from "next";
import { CategoryDetail } from "@/src/components/admin/category-detail";

export const metadata: Metadata = {
  title: "Détail d’une catégorie",
};

export default async function AdminCategoryDetailPage(
  props: PageProps<"/admin/categories/[id]">,
) {
  const { id } = await props.params;

  return <CategoryDetail categoryId={id} />;
}
