import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { LoginOtpForm } from "@/src/components/auth/login-otp-form";
import { ResendLoginOtpButton } from "@/src/components/auth/resend-login-otp-button";
import { safeRedirectPath } from "@/src/lib/auth-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Code de connexion",
  description: "Saisissez le code de connexion reçu par e-mail.",
  robots: { index: false, follow: false },
};

/**
 * Dernière étape de `POST /auth/login` (audit pré-production) : mot de passe
 * et adresse déjà vérifiés, un code à 6 chiffres vient d'être envoyé par
 * e-mail et reste à saisir pour obtenir une session — voir `loginAction`,
 * qui redirige ici plutôt que de poser un cookie directement.
 */
export default async function LoginOtpPage(props: {
  searchParams: Promise<{ email?: string; retour?: string }>;
}) {
  const { email, retour } = await props.searchParams;

  // Cette page n'a de sens qu'après une tentative de connexion réussie
  // (mot de passe correct) : sans adresse, rien à vérifier.
  if (!email) {
    redirect("/connexion");
  }

  const retourPath = safeRedirectPath(retour);

  return (
    <AuthLayout
      title="Vérifiez votre boîte mail"
      description={`Un code de connexion à 6 chiffres a été envoyé à ${email}. Il est valable 10 minutes.`}
      footer={
        <p className="text-muted-foreground text-sm">
          Une erreur d’adresse ? Retournez à{" "}
          <a
            href="/connexion"
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            la page de connexion
          </a>
          .
        </p>
      }
    >
      <div className="space-y-6">
        <div className="bg-muted mx-auto flex size-16 items-center justify-center rounded-full">
          <KeyRound aria-hidden className="text-accent-strong size-8" />
        </div>

        <LoginOtpForm email={email} retour={retourPath} />

        <ResendLoginOtpButton email={email} />
      </div>
    </AuthLayout>
  );
}
