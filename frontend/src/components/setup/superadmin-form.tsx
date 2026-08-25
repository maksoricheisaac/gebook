"use client";

import { useActionState, useState } from "react";
import { Check, KeyRound } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { PasswordInput } from "@/src/components/auth/password-input";
import { createSuperadminAction } from "@/src/lib/setup-actions";
import type { AuthFormState } from "@/src/lib/auth-actions";
import { cn } from "@/src/lib/utils";

const initialState: AuthFormState = {};

const PASSWORD_RULES = [
  { label: "8 caractères minimum", test: (value: string) => value.length >= 8 },
  { label: "une majuscule", test: (value: string) => /[A-ZÀ-Þ]/.test(value) },
  { label: "une minuscule", test: (value: string) => /[a-zß-ÿ]/.test(value) },
  { label: "un chiffre", test: (value: string) => /\d/.test(value) },
];

/**
 * Formulaire de l'assistant de configuration initiale.
 *
 * Reprend la structure de `RegisterForm` — mêmes règles de mot de passe, mêmes
 * messages d'erreur affichés sous le bon champ — avec un champ en plus : le
 * jeton de configuration (`SETUP_TOKEN`), sans lequel l'API refuse la création
 * même si tout le reste du formulaire est valide.
 */
export function SuperadminForm() {
  const [state, formAction, pending] = useActionState(
    createSuperadminAction,
    initialState,
  );
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <Field
        id="token"
        label="Jeton de configuration"
        hint="Communiqué séparément, généralement via la variable SETUP_TOKEN du serveur."
        required
        error={state.fieldErrors?.token?.[0]}
      >
        <div className="relative">
          <KeyRound
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input name="token" autoComplete="off" className="pl-10" />
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="firstName"
          label="Prénom"
          required
          error={state.fieldErrors?.firstName?.[0]}
        >
          <Input name="firstName" autoComplete="given-name" />
        </Field>

        <Field
          id="lastName"
          label="Nom"
          optional
          error={state.fieldErrors?.lastName?.[0]}
        >
          <Input name="lastName" autoComplete="family-name" />
        </Field>
      </div>

      <Field
        id="email"
        label="Adresse e-mail"
        required
        error={state.fieldErrors?.email?.[0]}
      >
        <Input name="email" type="email" autoComplete="email" />
      </Field>

      <Field
        id="password"
        label="Mot de passe"
        required
        error={state.fieldErrors?.password?.[0]}
      >
        <PasswordInput
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <ul className="-mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {PASSWORD_RULES.map((rule) => {
          const satisfied = rule.test(password);

          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors duration-[--duration-fast]",
                satisfied ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Check
                aria-hidden
                className={cn("size-3.5 shrink-0", !satisfied && "opacity-35")}
                strokeWidth={3}
              />
              {rule.label}
              <span className="sr-only">{satisfied ? " — validé" : " — manquant"}</span>
            </li>
          );
        })}
      </ul>

      <Field
        id="passwordConfirmation"
        label="Confirmer le mot de passe"
        required
        error={state.fieldErrors?.passwordConfirmation?.[0]}
      >
        <PasswordInput name="passwordConfirmation" autoComplete="new-password" />
      </Field>

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Création du compte…" : "Créer le compte superadmin"}
      </Button>
    </form>
  );
}
