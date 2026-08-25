import type { Metadata } from "next";
import { AuthorDetail } from "@/src/components/admin/author-detail";

export const metadata: Metadata = {
  title: "Modifier un auteur",
};

export default async function AdminAuthorDetailPage(
  props: PageProps<"/admin/auteurs/[id]">,
) {
  const { id } = await props.params;

  return <AuthorDetail authorId={id} />;
}
