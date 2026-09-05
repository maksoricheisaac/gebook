"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

/**
 * Barre de recherche minimale, partagée par `/auteurs` et `/espaces`.
 *
 * Même principe que `CatalogFilters` (`/livres`), en plus simple : ni
 * catégorie ni format ici, un seul champ. Le résultat reste dans l'URL
 * (`?q=`) plutôt que dans un état local isolé — une recherche demeure donc
 * partageable et compatible avec le bouton « précédent ».
 */
export function SimpleSearchForm({
  action,
  label,
  placeholder,
  initialQuery,
}: {
  /** Chemin de la page courante (`/auteurs`, `/espaces`). */
  action: string;
  label: string;
  placeholder: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputId = `${action.replace(/\W+/g, "-")}-recherche`;

  return (
    <form
      role="search"
      className="mb-8 grid gap-2 sm:max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `${action}?q=${encodeURIComponent(trimmed)}` : action);
      }}
    >
      <Label htmlFor={inputId} className="text-secondary text-sm font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        />
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="pl-10"
        />
      </div>
    </form>
  );
}
