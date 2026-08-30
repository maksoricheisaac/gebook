"use client";

import { useActionState, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { createTenantAction, type CreateTenantFormState } from "@/src/lib/tenant-actions";
import { slugify } from "@/src/lib/slugify";
import { TENANT_TYPE_OPTIONS } from "@/src/lib/tenant-type";
import type { DistributionTerms } from "@/src/lib/distribution-terms";

const initialState: CreateTenantFormState = {};

/**
 * Formulaire de création d'un espace (brief §7, onboarding ; conditions de
 * distribution — mission plateforme de paiement §17).
 *
 * Le slug se propose depuis le nom tant qu'il n'a pas été modifié à la main —
 * même logique que `category-manager.tsx`/`work-list.tsx` : proposer sans
 * jamais écraser un choix déjà fait par la personne qui remplit le formulaire.
 *
 * `termsByType` est chargé une fois côté serveur (`page.tsx`, les 4 versions
 * en vigueur) : changer le type ici ne fait que changer quel texte déjà en
 * main s'affiche, aucun aller-retour réseau supplémentaire.
 */
export function CreateWorkspaceForm({
  termsByType,
}: {
  termsByType: Record<string, DistributionTerms | null>;
}) {
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);
  const [name, setName] = useState("");
  const [manualSlug, setManualSlug] = useState<string | null>(null);
  const [type, setType] = useState("independent_author");
  const slug = manualSlug ?? slugify(name);
  const terms = termsByType[type] ?? null;

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <Field
        id="workspace-name"
        label="Nom de l'espace"
        hint="Votre nom de plume, ou celui de votre maison d'édition."
        required
        error={state.fieldErrors?.name?.[0]}
      >
        <Input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>

      <Field
        id="workspace-slug"
        label="Adresse (slug)"
        required
        error={state.fieldErrors?.slug?.[0]}
      >
        <Input
          name="slug"
          value={slug}
          onChange={(event) => setManualSlug(event.target.value)}
        />
      </Field>

      <Field
        id="workspace-type"
        label="Type d'espace"
        required
        error={state.fieldErrors?.type?.[0]}
      >
        <Select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {TENANT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="workspace-description"
        label="Description"
        optional
        error={state.fieldErrors?.description?.[0]}
      >
        <Textarea name="description" rows={3} />
      </Field>

      <div className="border-border bg-paper-100/70 rounded-lg border p-4">
        <p className="text-secondary mb-2 text-sm font-semibold">
          {terms ? terms.title : "Conditions de distribution"}
        </p>
        {terms ? (
          <div className="text-muted-foreground max-h-40 overflow-y-auto pr-1 text-sm whitespace-pre-line">
            {terms.content}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Aucune condition de distribution n’est publiée pour ce type d’espace pour le
            moment.
          </p>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            disabled={!terms}
            className="border-border mt-0.5 size-4 shrink-0 rounded"
          />
          <span>
            J’ai lu et j’accepte les conditions de distribution ci-dessus
            {terms ? ` (version ${terms.version})` : ""}.
          </span>
        </label>
        {state.fieldErrors?.acceptTerms?.[0] && (
          <p className="text-destructive mt-1.5 text-xs">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Création de l'espace…" : "Créer mon espace"}
      </Button>
    </form>
  );
}
