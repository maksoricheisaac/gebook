"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { registerAction, type AuthFormState } from "@/src/lib/auth-actions";
import { cn } from "@/src/lib/utils";
import { PasswordInput } from "./password-input";

const initialState: AuthFormState = {};

/**
 * Règles de mot de passe, telles que l'API les applique.
 *
 * Elles sont vérifiées à la saisie et affichées en clair. Avant, la contrainte
 * n'apparaissait que sous forme de phrase, et sa violation ne se découvrait
 * qu'après l'envoi du formulaire — c'est-à-dire au pire moment.
 *
 * Ce contrôle est un CONFORT, pas une validation : l'API reste seule juge, et
 * ses messages d'erreur s'affichent normalement sous le champ.
 */
const PASSWORD_RULES = [
  { label: "8 caractères minimum", test: (value: string) => value.length >= 8 },
  { label: "une majuscule", test: (value: string) => /[A-ZÀ-Þ]/.test(value) },
  { label: "une minuscule", test: (value: string) => /[a-zß-ÿ]/.test(value) },
  { label: "un chiffre", test: (value: string) => /\d/.test(value) },
];

export function RegisterForm({ retour }: { retour?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      {retour && <input type="hidden" name="retour" value={retour} />}

      <FormError message={state.error} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="firstName"
          label="Prénom"
          required
          error={state.fieldErrors?.firstName?.[0]}
        >
          <Input name="firstName" autoComplete="given-name" autoFocus />
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
        hint="Elle servira à retrouver vos commandes."
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
              {/* La coche est décorative : l'état réel est dit en toutes lettres. */}
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

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="accent-primary mt-0.5 size-4.5 shrink-0 cursor-pointer"
          />
          <span className="text-secondary leading-relaxed">
            J’accepte les conditions d’utilisation de GeBook et le traitement de mes
            données pour le suivi de mes commandes.
          </span>
        </label>
        {state.fieldErrors?.acceptTerms?.[0] && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
