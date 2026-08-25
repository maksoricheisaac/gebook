import { resolveAssetUrl } from "@/src/lib/assets";
import { cn } from "@/src/lib/utils";
import { CoverImage } from "./cover-image";

/*
 * Couverture d'un ouvrage.
 *
 * Deux problèmes réglés ici, tous deux visibles sur les captures d'origine :
 *
 *   1. les œuvres sans couverture affichaient une icône générique dans un cadre
 *      bleu pâle — une vignette « cassée » répétée sur toute la grille. À la
 *      place, une couverture typographique est composée : titre en Fraunces,
 *      auteur en bas, filet doré. Elle vient des vraies données de l'œuvre,
 *      n'invente rien, et se lit comme une couverture d'éditeur ;
 *   2. le rapport de forme était 3/4, celui d'une photo, alors qu'un livre se
 *      rapproche de 2/3. La grille entière y gagne son air de rayonnage.
 *
 * La tranche (`.book-spine`) donne son épaisseur à l'objet : c'est ce qui fait
 * la différence entre une image dans un cadre et un livre posé.
 */
export function BookCover({
  title,
  authorName,
  coverPath,
  sizes,
  priority = false,
  className,
}: {
  title: string;
  authorName: string;
  coverPath: string | null;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const source = resolveAssetUrl(coverPath);

  return (
    <div
      className={cn(
        // `@container` : le titre de la couverture de repli se dimensionne sur
        // la largeur de la vignette, pas sur celle de l'écran. La même
        // couverture reste donc juste en grille de 2 comme en grille de 4.
        "book-spine bg-paper-200 relative aspect-2/3 overflow-hidden rounded-sm @container",
        "ring-ink-900/10 shadow-raised ring-1",
        className,
      )}
    >
      {source ? (
        <CoverImage
          src={source}
          sizes={sizes}
          priority={priority}
          fallback={<FallbackCover title={title} authorName={authorName} />}
        />
      ) : (
        <FallbackCover title={title} authorName={authorName} />
      )}
    </div>
  );
}

/**
 * Couverture composée, faute d'image téléversée.
 *
 * Le fond alterne entre deux encres selon le titre, pour qu'une grille de livres
 * sans couverture ne soit pas un mur uniforme. La valeur est dérivée du titre :
 * elle est donc stable entre le serveur et le client, contrairement à un tirage
 * aléatoire qui provoquerait une erreur d'hydratation.
 */
function FallbackCover({ title, authorName }: { title: string; authorName: string }) {
  const tint = hashToTint(title);

  return (
    <div className={cn("relative h-full w-full p-[6%]", tint)}>
      {/* Encadrement doré, comme sur les couvertures dessinées du catalogue :
          c'est ce qui rattache la couverture de repli à la même famille. */}
      <div className="border-accent/45 flex h-full w-full flex-col justify-between rounded-[2px] border p-[7%] text-left">
        <span aria-hidden className="bg-accent/70 h-px w-[22%] shrink-0" />

        <span className="font-heading line-clamp-6 text-[clamp(0.85rem,7cqw,1.6rem)] leading-[1.12] font-semibold text-balance text-white">
          {title}
        </span>

        <span className="truncate text-[clamp(0.5rem,2.6cqw,0.72rem)] tracking-[0.14em] text-white/55 uppercase">
          {authorName}
        </span>
      </div>
    </div>
  );
}

/** Quatre encres de la palette, réparties de façon stable et déterministe. */
const TINTS = ["bg-ink-800", "bg-ink-700", "bg-leaf-700", "bg-ink-900"] as const;

function hashToTint(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1024;
  }
  return TINTS[hash % TINTS.length]!;
}
