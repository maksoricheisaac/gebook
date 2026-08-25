"use client";

import { useActionState, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { createTenantAction, type CreateTenantFormState } from "@/src/lib/tenant-actions";
import { slugify } from "@/src/lib/slugify";

const TENANT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "independent_author", label: "Auteur indépendant" },
  { value: "publishing_house", label: "Maison d'édition" },
  { value: "collective", label: "Collectif d'auteurs" },
  { value: "cultural_organization", label: "Organisation culturelle" },
];

const initialState: CreateTenantFormState = {};

/**
 * Formulaire de création d'un espace (brief §7, onboarding).
 *
 * Le slug se propose depuis le nom tant qu'il n'a pas été modifié à la main —
 * même logique que `category-manager.tsx`/`work-list.tsx` : proposer sans
 * jamais écraser un choix déjà fait par la personne qui remplit le formulaire.
 */
export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);
  const [name, setName] = useState("");
  const [manualSlug, setManualSlug] = useState<string | null>(null);
  const slug = manualSlug ?? slugify(name);

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
        <Select name="type" defaultValue="independent_author">
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

      <Button type="submit" size="lg" isLoading={pending} className="w-full">
        {pending ? "Création de l'espace…" : "Créer mon espace"}
      </Button>
    </form>
  );
}
