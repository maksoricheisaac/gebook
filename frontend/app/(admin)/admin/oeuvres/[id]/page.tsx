import type { Metadata } from "next";
import { WorkEditor } from "@/src/components/admin/work-editor";

export const metadata: Metadata = {
  title: "Modifier une œuvre",
};

export default async function AdminWorkEditPage(props: PageProps<"/admin/oeuvres/[id]">) {
  const { id } = await props.params;

  return <WorkEditor workId={id} />;
}
