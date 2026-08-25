import Link from "next/link";

import { Badge } from "@/src/components/ui/badge";
import { formatPrice } from "@/src/lib/format";
import type { WorkSummary } from "@/src/lib/catalog";
import { cn } from "@/src/lib/utils";
import { BookCover } from "./book-cover";

/*
 * Vignette d'ouvrage.
 *
 * Elle n'est plus une carte. La grille précédente empilait des rectangles blancs
 * bordés et ombrés : quinze cadres identiques dont l'œil ne pouvait plus
 * extraire un livre. Ici la couverture EST la carte, et le texte vit sur le
 * papier de la page, comme dans un catalogue d'éditeur.
 *
 * Ordre de lecture délibéré : couverture → catégorie → titre → auteur → prix.
 * La catégorie précède le titre parce qu'elle sert au balayage rapide ; le prix
 * ferme le bloc parce qu'il décide.
 *
 * Un seul lien couvre la couverture ET le titre (`::after` étendu). Les deux
 * liens superposés de la version précédente faisaient entendre deux fois le même
 * titre aux lecteurs d'écran et doublaient les arrêts au clavier.
 */
export function BookCard({
  work,
  variant = "full",
  priority = false,
  className,
}: {
  work: WorkSummary;
  /** `compact` masque les étiquettes de format, dans les grilles secondaires. */
  variant?: "full" | "compact";
  priority?: boolean;
  className?: string;
}) {
  const price = work.priceFrom ? formatPrice(work.priceFrom) : null;

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <BookCover
        title={work.title}
        authorName={work.author.penName}
        coverPath={work.coverPath}
        priority={priority}
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
        className="transition-[transform,box-shadow] duration-[--duration-base] ease-[--ease-out] group-hover:-translate-y-1 group-hover:shadow-lifted"
      />

      <div className="mt-4 flex flex-1 flex-col gap-1.5">
        {work.category && (
          <p className="type-label text-muted-foreground">{work.category.name}</p>
        )}

        <h3 className="type-h3 text-secondary">
          <Link
            href={`/livres/${work.slug}`}
            /* `after:absolute inset-0` étend la zone cliquable à toute la
               vignette sans dupliquer le lien dans l'arbre d'accessibilité. */
            className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary transition-colors duration-[--duration-fast]"
          >
            {work.title}
          </Link>
        </h3>

        <p className="text-muted-foreground text-sm">{work.author.penName}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          {price ? (
            <p className="text-secondary tnum text-[0.9375rem] font-semibold">
              <span className="type-caption mr-1 font-normal">dès</span>
              {price}
            </p>
          ) : (
            <span className="type-caption">Bientôt disponible</span>
          )}

          {/*
           * Les étiquettes de format disparaissent sous 640 px : à deux colonnes
           * sur un téléphone, elles se renvoyaient à la ligne et coupaient le
           * prix en deux. Le format reste visible sur la fiche de l'ouvrage,
           * là où il sert réellement à décider.
           */}
          {variant === "full" && work.formats.length > 0 && (
            <ul className="hidden flex-wrap justify-end gap-1 sm:flex">
              {work.formats.slice(0, 3).map((format) => (
                <li key={format.id}>
                  <Badge variant="tag">{format.formatType}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
