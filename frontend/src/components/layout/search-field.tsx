"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/src/lib/utils";

/*
 * Recherche du catalogue.
 *
 * Elle remplace l'icône de loupe de l'en-tête, qui n'était qu'un lien vers
 * `/livres` : le visiteur cliquait sur une loupe et arrivait sur une liste, sans
 * champ de saisie sous le curseur.
 *
 * C'est un vrai `<form method="GET">` : il fonctionne sans JavaScript, la
 * recherche vit dans l'URL — donc partageable, indexable, compatible avec le
 * bouton « précédent » — et `router.push` ne sert qu'à éviter un rechargement
 * complet quand le JavaScript est là.
 */
export function SearchField({
  className,
  size = "default",
  autoFocus = false,
  onSubmitted,
}: {
  className?: string;
  size?: "default" | "lg";
  autoFocus?: boolean;
  /** Permet au menu mobile de se refermer une fois la recherche lancée. */
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  return (
    <form
      action="/livres"
      method="get"
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `/livres?q=${encodeURIComponent(trimmed)}` : "/livres");
        onSubmitted?.();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Rechercher un livre, un auteur ou une catégorie
      </label>
      <Search
        aria-hidden
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2",
          size === "lg" ? "size-5" : "size-4",
        )}
      />
      <input
        id={inputId}
        name="q"
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un livre, un auteur…"
        className={cn(
          "border-input bg-card w-full rounded-md border text-base transition-[border-color,box-shadow] duration-[--duration-fast]",
          "placeholder:text-muted-foreground/70",
          "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] focus-visible:outline-none",
          size === "lg" ? "h-12 pr-4 pl-11" : "h-10 pr-3 pl-9 md:text-sm",
        )}
      />
    </form>
  );
}
