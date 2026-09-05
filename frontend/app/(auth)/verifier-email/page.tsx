import type { Metadata } from "next";
import { MailCheck } from "lucide-react";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { ResendVerificationButton } from "@/src/components/auth/resend-verification-button";
import { VerifyEmailForm } from "@/src/components/auth/verify-email-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérifiez votre e-mail",
  description: "Confirmez votre adresse e-mail pour activer votre compte GeBook.",
  robots: { index: false, follow: false },
};

/**
 * Deux usages de la même page (brief « vérification d'e-mail obligatoire ») :
 *   - `?token=...` : lien reçu par e-mail, soumis automatiquement en `POST`
 *     (voir `VerifyEmailForm`) — vérifie l'adresse et connecte directement ;
 *   - `?email=...` : juste après une inscription ou une tentative de
 *     connexion sur un compte non vérifié — invite à consulter la boîte mail,
 *     avec un renvoi possible si le premier e-mail n'arrive jamais.
 */
export default async function VerifyEmailPage(props: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await props.searchParams;

  return (
    <AuthLayout
      title={token ? "Vérification de votre adresse" : "Vérifiez votre boîte mail"}
      description={
        token
          ? "Un instant, nous confirmons votre adresse e-mail."
          : email
            ? `Un lien de confirmation a été envoyé à ${email}. Cliquez dessus pour activer votre compte.`
            : "Un lien de confirmation vous a été envoyé par e-mail."
      }
      footer={
        <p className="text-muted-foreground text-sm">
          Une erreur d’adresse ? Recommencez l’inscription depuis le début.
        </p>
      }
    >
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <div className="space-y-6">
          <div className="bg-muted mx-auto flex size-16 items-center justify-center rounded-full">
            <MailCheck aria-hidden className="text-accent-strong size-8" />
          </div>
          {email && <ResendVerificationButton email={email} />}
        </div>
      )}
    </AuthLayout>
  );
}
