"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormError } from "@/src/components/ui/field";
import { verifyEmailAction, type AuthFormState } from "@/src/lib/auth-actions";

const initialState: AuthFormState = {};

/**
 * Soumet automatiquement le jeton reçu par e-mail, sans action de l'utilisateur.
 *
 * En `POST`, jamais en chargeant directement une URL en `GET` : un lien cliqué
 * depuis un client mail est parfois pré-chargé par un filtre antispam, ce qui
 * consommerait le jeton à usage unique avant même l'ouverture de la page par
 * son destinataire (voir le même raisonnement côté `AuthController.verifyEmail`).
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(verifyEmailAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <p className="text-muted-foreground text-sm">
        {pending || !state.error
          ? "Vérification de votre adresse en cours…"
          : "La vérification a échoué."}
      </p>
    </form>
  );
}
