import Image from "next/image";
import Link from "next/link";

import { resolveAssetUrl } from "@/src/lib/assets";
import { authorInitials, type AuthorSummary } from "@/src/lib/catalog";

/*
 * Fiche d'auteur.
 *
 * Alignée à gauche, sur le papier de la page. La version précédente centrait
 * tout dans un cadre blanc arrondi : le nom, la ville, le nombre d'ouvrages et
 * un lien « Voir le profil » — quatre lignes centrées qui se lisaient comme un
 * badge de conférence, pas comme la présentation d'un écrivain.
 *
 * Un auteur est une personne : la photo (ou ses initiales) est ronde et grande,
 * le nom porte la typographie de titre, et la biographie a droit à sa place.
 */
export function AuthorCard({
  author,
  variant = "full",
}: {
  author: AuthorSummary;
  /** `compact` retire la biographie, pour les rangées de découverte. */
  variant?: "full" | "compact";
}) {
  const location = [author.city, author.country].filter(Boolean).join(", ");

  return (
    <article className="group relative flex gap-4">
      <AuthorAvatar author={author} />

      <div className="min-w-0 flex-1">
        <h3 className="type-h3 text-secondary">
          <Link
            href={`/auteurs/${author.slug}`}
            className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary transition-colors duration-[--duration-fast]"
          >
            {author.penName}
          </Link>
        </h3>

        <p className="type-meta mt-0.5">
          {author.workCount} {author.workCount > 1 ? "ouvrages" : "ouvrage"}
          {location && ` · ${location}`}
        </p>

        {variant === "full" && author.shortBiography && (
          <p className="text-muted-foreground mt-2.5 line-clamp-3 text-sm leading-relaxed text-pretty">
            {author.shortBiography}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Portrait de l'auteur, ou ses initiales.
 *
 * Interne au fichier : la fiche d'auteur détaillée compose son propre portrait,
 * à une taille différente. Un composant paramétrable pour deux usages qui ne se
 * ressemblent pas coûterait plus qu'il ne rapporte.
 */
function AuthorAvatar({ author }: { author: AuthorSummary }) {
  if (author.photoPath) {
    return (
      <Image
        src={resolveAssetUrl(author.photoPath)!}
        alt=""
        width={128}
        height={128}
        className="ring-border size-16 shrink-0 rounded-full object-cover ring-1"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-paper-200 text-ink-600 font-heading grid size-16 shrink-0 place-items-center rounded-full text-lg"
    >
      {authorInitials(author.penName)}
    </span>
  );
}
