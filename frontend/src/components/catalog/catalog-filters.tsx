"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input, Select } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { FORMAT_OPTIONS, type Category } from "@/src/lib/catalog";

/**
 * Recherche et filtres du catalogue.
 *
 * Composant client : il porte la saisie. Les filtres restent pourtant dans
 * l'URL, et la liste est rendue côté serveur — une recherche demeure donc
 * partageable, indexable et compatible avec le bouton « précédent ».
 *
 * Deux changements par rapport à la barre précédente :
 *
 *   - les filtres actifs sont affichés en jetons retirables sous la barre.
 *     Avant, une fois la liste déroulante refermée, plus rien ne disait qu'un
 *     filtre était appliqué : on lisait « aucun résultat » sans comprendre
 *     pourquoi ;
 *   - un `aria-live` annonce le nombre de résultats. Sans lui, un utilisateur de
 *     lecteur d'écran voyait la page changer sans en être informé.
 *
 * Les listes déroulantes restent des `<select>` natifs : ils fonctionnent sans
 * JavaScript, se comportent correctement au clavier et ouvrent le sélecteur du
 * téléphone sur mobile.
 */
export function CatalogFilters({
  categories,
  current,
  resultCount,
}: {
  categories: Category[];
  current: { q: string; category: string; format: string };
  resultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(current.q);

  /** Met à jour des paramètres d'URL et revient toujours à la première page. */
  const apply = (changes: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    // Sans cette remise à zéro, un filtre appliqué depuis la page 3 afficherait
    // une page vide alors que des résultats existent.
    params.delete("page");

    router.push(params.size > 0 ? `/livres?${params.toString()}` : "/livres");
  };

  const activeFilters = [
    current.q && { key: "q", label: `« ${current.q} »` },
    current.category && {
      key: "category",
      label:
        categories.find((category) => category.slug === current.category)?.name ??
        current.category,
    },
    current.format && {
      key: "format",
      label:
        FORMAT_OPTIONS.find((option) => option.value === current.format)?.label ??
        current.format,
    },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <section aria-label="Recherche et filtres" className="space-y-4">
      <form
        role="search"
        className="border-border bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query.trim() });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="recherche" className="text-secondary text-sm font-semibold">
            Rechercher
          </Label>
          <div className="relative">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            />
            <Input
              id="recherche"
              name="q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titre, auteur ou sujet"
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="categorie" className="text-secondary text-sm font-semibold">
            Domaine
          </Label>
          <Select
            id="categorie"
            name="category"
            value={current.category}
            onChange={(event) => apply({ category: event.target.value })}
          >
            <option value="">Tous les domaines</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="format" className="text-secondary text-sm font-semibold">
            Format
          </Label>
          <Select
            id="format"
            name="format"
            value={current.format}
            onChange={(event) => apply({ format: event.target.value })}
          >
            <option value="">Tous les formats</option>
            {FORMAT_OPTIONS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" className="md:mb-0">
          <SlidersHorizontal aria-hidden />
          Filtrer
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/*
         * `aria-live="polite"` : le nombre de résultats est annoncé après chaque
         * filtrage, sans interrompre ce que l'utilisateur est en train de faire.
         */}
        <p aria-live="polite" className="type-meta">
          <strong className="text-secondary font-semibold">{resultCount}</strong>{" "}
          {resultCount > 1 ? "ouvrages trouvés" : "ouvrage trouvé"}
        </p>

        {activeFilters.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <li key={filter.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (filter.key === "q") setQuery("");
                    apply({ [filter.key]: "" });
                  }}
                  className="border-border-strong bg-card text-secondary hover:border-destructive/40 hover:text-destructive inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-xs font-medium transition-colors duration-[--duration-fast]"
                >
                  {filter.label}
                  <X aria-hidden className="size-3.5" />
                  <span className="sr-only">— retirer ce filtre</span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  router.push("/livres");
                }}
                className="text-muted-foreground hover:text-secondary cursor-pointer text-xs font-medium underline underline-offset-4"
              >
                Tout effacer
              </button>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
