import Link from "next/link";
import type { Metadata } from "next";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { CreateWorkspaceForm } from "@/src/components/account/create-workspace-form";
import { requireUser } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créer mon espace",
  description: "Ouvrez votre espace éditeur ou auteur sur GeBook.",
  robots: { index: false, follow: false },
};

/**
 * Onboarding éditeur/auteur (brief §7).
 *
 * Accessible à tout compte déjà connecté — lecteur, auteur ou éditeur : rien
 * n'empêche un lecteur de devenir aussi propriétaire d'un espace, et un même
 * compte peut cumuler plusieurs adhésions de tenant (brief §3). La création
 * pose immédiatement l'espace comme actif et redirige vers son tableau de
 * bord (`createTenantAction`) — pas d'étape intermédiaire à traverser.
 */
export default async function CreateWorkspacePage() {
  await requireUser("/creer-un-espace");

  return (
    <AuthLayout
      aside="publisher"
      title="Créez votre espace."
      description="Quelques informations suffisent pour ouvrir votre espace éditeur ou auteur."
      footer={
        <p className="text-muted-foreground text-sm">
          <Link
            href="/mon-espace"
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            ← Retour à mon espace
          </Link>
        </p>
      }
    >
      <CreateWorkspaceForm />
    </AuthLayout>
  );
}
