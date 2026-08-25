import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { SuperadminForm } from "@/src/components/setup/superadmin-form";
import { getSetupStatus } from "@/src/lib/setup-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration initiale",
  robots: { index: false, follow: false },
};

/**
 * Assistant de configuration initiale — page hors des groupes `(site)`/`(admin)` :
 * elle ne doit ni porter l'en-tête public ni exiger une session déjà ouverte,
 * les deux n'ayant aucun sens avant que le premier compte n'existe.
 *
 * Fermée dès qu'un superadmin existe (`SetupService` côté API) : au lieu d'un
 * formulaire qui échouerait systématiquement, la page redirige directement vers
 * la connexion.
 */
export default async function SetupPage() {
  const status = await getSetupStatus();
  if (status.completed) {
    redirect("/connexion");
  }

  return (
    <AuthLayout
      aside="welcome"
      title="Configuration initiale de GeBook."
      description="Cette page ne s'affiche qu'une seule fois : elle crée le compte superadmin qui administrera toute la plateforme. Le jeton de configuration est requis."
      footer={
        <p className="text-muted-foreground text-sm">
          Un compte superadmin existe déjà ? Retournez à la{" "}
          <a
            href="/connexion"
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            connexion
          </a>
          .
        </p>
      }
    >
      <SuperadminForm />
    </AuthLayout>
  );
}
