import Link from "next/link";
import type { Metadata } from "next";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { CreateWorkspaceForm } from "@/src/components/account/create-workspace-form";
import { requireUser } from "@/src/lib/auth";
import {
  getActiveDistributionTerms,
  type DistributionTerms,
} from "@/src/lib/distribution-terms";
import { TENANT_TYPE_OPTIONS } from "@/src/lib/tenant-type";

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

  // Les quatre versions en vigueur sont chargées une fois, côté serveur : le
  // sélecteur de type change côté client sans aller-retour réseau
  // supplémentaire (mission plateforme de paiement §17).
  const termsEntries = await Promise.all(
    TENANT_TYPE_OPTIONS.map(
      async (option) =>
        [option.value, await getActiveDistributionTerms(option.value)] as const,
    ),
  );
  const termsByType: Record<string, DistributionTerms | null> =
    Object.fromEntries(termsEntries);

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
      <CreateWorkspaceForm termsByType={termsByType} />
    </AuthLayout>
  );
}
