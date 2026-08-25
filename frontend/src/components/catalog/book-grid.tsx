import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { Reveal } from "@/src/components/motion/reveal";
import type { WorkSummary } from "@/src/lib/catalog";
import { cn } from "@/src/lib/utils";
import { BookCard } from "./book-card";

/**
 * Grille d'ouvrages.
 *
 * Deux colonnes dès le plus petit écran : sur un téléphone, une colonne unique
 * transformait le catalogue en une bande interminable où l'on ne comparait rien.
 * L'écart vertical est plus grand que l'horizontal, pour que chaque rangée se
 * lise comme une étagère.
 *
 * `emptyAction` est obligatoire dans les faits : un état vide sans porte de
 * sortie laisse le visiteur bloqué.
 */
export function BookGrid({
  works,
  variant = "full",
  emptyTitle = "Aucun livre ne correspond à cette recherche",
  emptyDescription = "Essayez un autre mot-clé, une autre catégorie, ou repartez du catalogue complet.",
  emptyAction,
  /** Les premières vignettes de la page d'accueil sont chargées en priorité. */
  priorityCount = 0,
  className,
}: {
  works: WorkSummary[];
  variant?: "full" | "compact";
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  priorityCount?: number;
  className?: string;
}) {
  if (works.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription}>
        {emptyAction ?? (
          <Button asChild variant="outline">
            <Link href="/livres">Voir tout le catalogue</Link>
          </Button>
        )}
      </EmptyState>
    );
  }

  return (
    <Reveal
      stagger={0.05}
      className={cn(
        "grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4",
        className,
      )}
    >
      {works.map((work, index) => (
        <BookCard
          key={work.id}
          work={work}
          variant={variant}
          priority={index < priorityCount}
        />
      ))}
    </Reveal>
  );
}
