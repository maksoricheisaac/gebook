import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BookGrid } from "@/src/components/catalog/book-grid";
import { Breadcrumb, Container, SectionHeader } from "@/src/components/layout/page-shell";
import { ApiError } from "@/src/lib/api";
import { resolveAssetUrl } from "@/src/lib/assets";
import {
  authorInitials,
  fetchAuthor,
  fetchWorks,
  type AuthorDetail,
} from "@/src/lib/catalog";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

async function loadAuthor(slug: string): Promise<AuthorDetail> {
  try {
    return await fetchAuthor(slug);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata(
  props: PageProps<"/auteurs/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;

  try {
    const author = await fetchAuthor(slug);
    const description =
      author.shortBiography ?? `Les ouvrages de ${author.penName} publiés sur GeBook.`;

    return {
      title: author.penName,
      description,
      alternates: { canonical: `/auteurs/${author.slug}` },
      openGraph: { type: "profile", title: author.penName, description },
    };
  } catch {
    return {};
  }
}

/**
 * Fiche d'auteur.
 *
 * Portrait à gauche, biographie à droite, puis la bibliographie. La version
 * précédente centrait le bloc d'introduction, ce qui cassait la lecture dès que
 * la biographie dépassait deux lignes.
 */
export default async function AuthorPage(props: PageProps<"/auteurs/[slug]">) {
  const { slug } = await props.params;
  const author = await loadAuthor(slug);
  const works = await fetchWorks({ author: slug, perPage: 24 });

  const location = [author.city, author.country].filter(Boolean).join(", ");

  return (
    <Container size="wide" className="pb-20">
      <div className="pt-8">
        <Breadcrumb
          items={[
            { href: "/", label: "Accueil" },
            { href: "/auteurs", label: "Auteurs" },
            { label: author.penName },
          ]}
        />
      </div>

      <section className="border-border grid gap-8 border-b pb-12 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <AuthorPortrait author={author} />

        <div className="min-w-0">
          {location && (
            <p className="type-label rule-accent text-muted-foreground">{location}</p>
          )}
          <h1 className="type-h1 text-secondary">{author.penName}</h1>

          <p className="type-meta mt-3">
            {author.workCount}{" "}
            {author.workCount > 1 ? "ouvrages publiés" : "ouvrage publié"} sur GeBook
          </p>

          {author.biography && (
            <div className="prose-editorial text-foreground/85 mt-6">
              {author.biography}
            </div>
          )}
        </div>
      </section>

      <section className="mt-14">
        <SectionHeader
          eyebrow="Bibliographie"
          title={`Les ouvrages de ${author.penName}`}
        />
        <BookGrid
          works={works.data}
          priorityCount={4}
          emptyTitle="Aucun ouvrage publié pour le moment"
          emptyDescription="Les publications de cet auteur apparaîtront ici dès leur mise en ligne."
        />
      </section>
    </Container>
  );
}

function AuthorPortrait({ author }: { author: AuthorDetail }) {
  if (author.photoPath) {
    return (
      <Image
        src={resolveAssetUrl(author.photoPath)!}
        alt=""
        width={320}
        height={320}
        priority
        className="ring-border size-40 shrink-0 rounded-full object-cover ring-1 sm:size-44"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-paper-200 text-ink-600 font-heading grid size-40 shrink-0 place-items-center rounded-full text-4xl sm:size-44"
    >
      {authorInitials(author.penName)}
    </span>
  );
}
