"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/src/lib/utils";

/**
 * Pagination des listes d'administration.
 *
 * Même langage visuel que `catalog/pagination.tsx` (numéros condensés,
 * chevrons) mais pilotée par callback plutôt que par lien : les pages admin
 * gèrent leur page courante en état client (TanStack Query), pas par URL.
 */
export function AdminPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className="border-border flex items-center justify-center gap-1.5 border-t px-4 py-4"
      aria-label="Pages de la liste"
    >
      <Step
        disabled={page <= 1}
        label="Page précédente"
        icon={<ChevronLeft aria-hidden className="size-4" />}
        onClick={() => onPageChange(page - 1)}
      />

      <ul className="flex items-center gap-1">
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
              <button
                type="button"
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
                onClick={() => onPageChange(entry)}
                className={cn(
                  "tnum grid size-9 cursor-pointer place-items-center rounded-md text-sm transition-colors duration-[--duration-fast]",
                  entry === page
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "text-secondary hover:bg-muted",
                )}
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ul>

      <Step
        disabled={page >= totalPages}
        label="Page suivante"
        icon={<ChevronRight aria-hidden className="size-4" />}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

function Step({
  disabled,
  label,
  icon,
  onClick,
}: {
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-md transition-colors duration-[--duration-fast]",
        disabled
          ? "text-ink-300 cursor-not-allowed"
          : "text-secondary hover:bg-muted cursor-pointer",
      )}
    >
      {icon}
    </button>
  );
}

/** Réduit `1…n` à une suite lisible autour de la page courante — voir `catalog/pagination.tsx#condense`. */
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
