"use client";

import { useActionState } from "react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { verifyLoginOtpAction, type AuthFormState } from "@/src/lib/auth-actions";

const initialState: AuthFormState = {};

export function LoginOtpForm({ email, retour }: { email: string; retour?: string }) {
  const [state, formAction, pending] = useActionState(verifyLoginOtpAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="email" value={email} />
      {retour && <input type="hidden" name="retour" value={retour} />}

      <FormError message={state.error} />

      <Field
        id="code"
        label="Code de connexion"
        required
        error={state.fieldErrors?.code?.[0]}
        hint="6 chiffres, reçus par e-mail."
      >
        <Input
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123 456"
          className="text-center text-lg tracking-[0.3em] tabular-nums"
          autoFocus
        />
      </Field>

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Vérification en cours…" : "Valider le code"}
      </Button>
    </form>
  );
}
