import type { Metadata } from "next";

import { AdminPageHeader } from "@/src/components/admin/admin-page";
import { TeamManager } from "@/src/components/admin/team-manager";

export const metadata: Metadata = {
  title: "Équipe",
};

export default function AdminTeamPage() {
  return (
    <>
      <AdminPageHeader
        title="Équipe"
        description="Les personnes qui gèrent cet espace avec vous, et ce que chacune peut y faire."
      />
      <TeamManager />
    </>
  );
}
