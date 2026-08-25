"use client";

import { useActionState } from "react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { loginAction, type AuthFormState } from "@/src/lib/auth-actions";
import { PasswordInput } from "./password-input";

const initialState: AuthFormState = {};

export function LoginForm({ retour }: { retour?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {retour && <input type="hidden" name="retour" value={retour} />}

      <FormError message={state.error} />

      <Field
        id="email"
        label="Adresse e-mail"
        required
        error={state.fieldErrors?.email?.[0]}
      >
        <Input
          name="email"
          type="email"
          autoComplete="email"
          /* Le premier champ prend le focus : sur une page dont la connexion est
             l'unique objet, faire cliquer l'utilisateur est une étape de trop. */
          autoFocus
        />
      </Field>

      <Field
        id="password"
        label="Mot de passe"
        required
        error={state.fieldErrors?.password?.[0]}
      >
        <PasswordInput name="password" autoComplete="current-password" />
      </Field>

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Connexion en cours…" : "Se connecter"}
      </Button>
    </form>
  );
}
