import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/src/lib/utils";

/**
 * Pagination du catalogue.
 *
 * Rendue en liens réels et non en boutons : chaque page a sa propre adresse,
 * donc elle est partageable et indexable.
 *
 * La liste des numéros est désormais **condensée**. La version précédente
 * affichait toutes les pages : avec un catalogue de cinq livres cela passait,
 * avec deux cents ouvrages la barre aurait débordé de l'écran sur mobile.
 * Ici : première, dernière, page courante et ses voisines, séparées par des
 * ellipses.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 pt-12 sm:gap-1.5"
      aria-label="Pages du catalogue"
    >
      <Step
        href={buildHref(page - 1)}
        disabled={page <= 1}
        label="Page précédente"
        icon={<ChevronLeft aria-hidden className="size-4" />}
      />

      <ul className="flex flex-wrap items-center justify-center gap-1">
        {condense(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="text-ink-300 px-1 text-sm select-none"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={buildHref(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
                className={cn(
                  "tnum grid size-9 place-items-center rounded-md text-sm transition-colors duration-[--duration-fast] sm:size-10",
                  entry === page
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "text-secondary hover:bg-muted",
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>

      <Step
        href={buildHref(page + 1)}
        disabled={page >= totalPages}
        label="Page suivante"
        icon={<ChevronRight aria-hidden className="size-4" />}
      />
    </nav>
  );
}

function Step({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  if (disabled) {
    // Un lien désactivé sort du parcours au clavier plutôt que de piéger le
    // focus sur une destination inexistante.
    return (
      <span
        aria-hidden
        className="text-ink-300 grid size-9 place-items-center rounded-md sm:size-10"
      >
        {icon}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="text-secondary hover:bg-muted grid size-9 place-items-center rounded-md transition-colors duration-[--duration-fast] sm:size-10"
    >
      {icon}
    </Link>
  );
}

/**
 * Réduit `1…n` à une suite lisible autour de la page courante.
 *
 * Exemple pour la page 7 sur 20 : `1 … 6 7 8 … 20`.
 */
function condense(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) {
      result.push("gap");
    }
    result.push(value);
  }

  return result;
}
