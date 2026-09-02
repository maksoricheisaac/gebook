import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Languages, ScrollText } from "lucide-react";

import { BookCover } from "@/src/components/catalog/book-cover";
import { BookGrid } from "@/src/components/catalog/book-grid";
import { FormatSelector } from "@/src/components/catalog/format-selector";
import { Breadcrumb, Container, SectionHeader } from "@/src/components/layout/page-shell";
import { Badge } from "@/src/components/ui/badge";
import { RichText } from "@/src/components/ui/rich-text";
import { ApiError } from "@/src/lib/api";
import { getCurrentUser } from "@/src/lib/auth";
import {
  authorInitials,
  fetchWork,
  fetchWorks,
  type WorkDetail,
  type WorkSummary,
} from "@/src/lib/catalog";
import { formatDate, formatPrice } from "@/src/lib/format";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

async function loadWork(slug: string): Promise<WorkDetail> {
  try {
    return await fetchWork(slug);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata(
  props: PageProps<"/livres/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;

  try {
    const work = await fetchWork(slug);
    const description =
      work.shortDescription ??
      `${work.title}, de ${work.author.penName}. Disponible sur GeBook.`;

    return {
      title: work.title,
      description,
      alternates: { canonical: `/livres/${work.slug}` },
      openGraph: {
        type: "article",
        title: `${work.title} — ${work.author.penName}`,
        description,
      },
    };
  } catch {
    return {};
  }
}

/**
 * Fiche d'une œuvre.
 *
 * Vraie page produit, pas une fiche de base de données : la couverture et le
 * choix du format tiennent l'écran d'entrée, le texte long vient ensuite.
 *
 * Le bloc d'achat est **collant** sur grand écran. C'est le point qui manquait
 * le plus : sur une fiche longue, le prix et le bouton disparaissaient dès qu'on
 * commençait à lire le résumé, et il fallait remonter pour commander.
 */
export default async function WorkPage(props: PageProps<"/livres/[slug]">) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const format = searchParams.format;
  const defaultFormatId = Array.isArray(format) ? format[0] : format;

  const [work, currentUser] = await Promise.all([loadWork(slug), getCurrentUser()]);
  const related = await loadRelatedWorks(work);

  const priceFrom = work.priceFrom ? formatPrice(work.priceFrom) : null;
  const publication = work.publicationDate
    ? formatDate(work.publicationDate)
    : work.publicationYear
      ? String(work.publicationYear)
      : null;

  return (
    <>
      {/*
       * `JSON-LD` : sans lui, une fiche produit reste un texte quelconque pour un
       * moteur de recherche. Les données viennent uniquement de l'API — aucun
       * avis ni aucune note ne sont inventés, contrairement à ce que font la
       * plupart des balisages de ce type.
       */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(work)) }}
      />

      <Container size="wide" className="pb-20">
        <div className="pt-8">
          <Breadcrumb
            items={[
              { href: "/", label: "Accueil" },
              { href: "/livres", label: "Catalogue" },
              { label: work.title },
            ]}
          />
        </div>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          {/* ------------------------------------------------ Colonne éditoriale */}
          <div>
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
              <div className="w-44 shrink-0 sm:w-56">
                <BookCover
                  title={work.title}
                  authorName={work.author.penName}
                  coverPath={work.coverPath}
                  priority
                  sizes="(max-width: 640px) 176px, 224px"
                />
              </div>

              <div className="min-w-0 flex-1">
                {work.category && (
                  <Link
                    href={`/livres?category=${work.category.slug}`}
                    className="type-label text-muted-foreground hover:text-primary transition-colors"
                  >
                    {work.category.name}
                  </Link>
                )}

                <h1 className="type-h1 text-secondary mt-2">{work.title}</h1>

                {work.subtitle && <p className="type-subtitle mt-2">{work.subtitle}</p>}

                <p className="mt-4 text-[0.9375rem]">
                  <span className="text-muted-foreground">par </span>
                  <Link
                    href={`/auteurs/${work.author.slug}`}
                    className="text-secondary font-semibold underline-offset-4 hover:underline"
                  >
                    {work.author.penName}
                  </Link>
                </p>

                <dl className="border-border mt-7 grid gap-x-8 gap-y-3 border-t pt-5 sm:grid-cols-2">
                  {work.pageCount && (
                    <Meta
                      icon={ScrollText}
                      label="Pages"
                      value={String(work.pageCount)}
                    />
                  )}
                  <Meta icon={Languages} label="Langue" value={work.language} />
                  {publication && (
                    <Meta icon={ScrollText} label="Publication" value={publication} />
                  )}
                  {work.isbn && <Meta icon={ScrollText} label="ISBN" value={work.isbn} />}
                </dl>
              </div>
            </div>

            {work.shortDescription && (
              <p className="text-foreground/85 mt-10 text-[1.125rem] leading-relaxed text-pretty">
                {work.shortDescription}
              </p>
            )}

            {work.description && (
              <section className="mt-12">
                <h2 className="type-h2 text-secondary">À propos du livre</h2>
                <RichText html={work.description} className="text-foreground/85 mt-5" />
              </section>
            )}

            {work.tableOfContents && (
              <section className="mt-12">
                <h2 className="type-h2 text-secondary">Sommaire</h2>
                <div className="prose-editorial text-muted-foreground mt-5 whitespace-pre-line">
                  {work.tableOfContents}
                </div>
              </section>
            )}

            <section className="border-border mt-12 border-t pt-8">
              <h2 className="type-label rule-accent text-muted-foreground">L’auteur</h2>
              <div className="mt-3 flex gap-5">
                {/* Le résumé d'œuvre ne porte que l'identité de l'auteur, pas sa
                    photo : les initiales suffisent, et la fiche auteur complète
                    est à un clic. */}
                <span
                  aria-hidden
                  className="bg-paper-200 text-ink-600 font-heading grid size-16 shrink-0 place-items-center rounded-full text-lg"
                >
                  {authorInitials(work.author.penName)}
                </span>
                <div className="min-w-0">
                  <h3 className="type-h3 text-secondary">{work.author.penName}</h3>
                  <Link
                    href={`/auteurs/${work.author.slug}`}
                    className="text-primary mt-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                  >
                    Voir tous ses ouvrages
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </div>
              </div>
            </section>
          </div>

          {/* ------------------------------------------------------ Bloc d'achat */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border-border bg-card shadow-raised rounded-xl border p-6">
              {priceFrom && (
                <div className="border-border mb-6 flex items-baseline justify-between gap-3 border-b pb-5">
                  <span className="type-caption">À partir de</span>
                  <span className="font-heading text-secondary tnum text-2xl font-semibold">
                    {priceFrom}
                  </span>
                </div>
              )}

              <FormatSelector
                formats={work.formats}
                workSlug={work.slug}
                workTitle={work.title}
                authorName={work.author.penName}
                coverPath={work.coverPath}
                tenantSlug={work.tenant.slug}
                tenantName={work.tenant.name}
                isAuthenticated={currentUser !== null}
                defaultFormatId={defaultFormatId}
              />
            </div>

            {work.formats.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {work.formats.map((wf) => (
                  <li key={wf.id}>
                    <Badge variant={wf.isAvailable ? "tag" : "neutral"}>
                      {wf.formatType}
                      {!wf.isAvailable && " · indisponible"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section className="border-border mt-20 border-t pt-16">
            <SectionHeader
              eyebrow="Dans le même esprit"
              title="Vous aimerez aussi"
              href="/livres"
              linkLabel="Tout le catalogue"
            />
            <BookGrid works={related} variant="compact" />
          </section>
        )}
      </Container>
    </>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ScrollText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden className="text-ink-300 mt-0.5 size-4 shrink-0" />
      <div>
        <dt className="type-caption">{label}</dt>
        <dd className="text-secondary text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

async function loadRelatedWorks(work: WorkDetail): Promise<WorkSummary[]> {
  const filters = work.category
    ? { category: work.category.slug, perPage: 5 }
    : { author: work.author.slug, perPage: 5 };

  const { data } = await fetchWorks(filters);

  return data.filter((candidate) => candidate.slug !== work.slug).slice(0, 4);
}

/** Balisage `schema.org/Book`, strictement limité aux données réelles. */
function buildJsonLd(work: WorkDetail) {
  const availableFormats = work.formats.filter((format) => format.isAvailable);

  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: work.title,
    ...(work.subtitle ? { alternateName: work.subtitle } : {}),
    ...(work.shortDescription ? { description: work.shortDescription } : {}),
    ...(work.isbn ? { isbn: work.isbn } : {}),
    inLanguage: work.language,
    ...(work.pageCount ? { numberOfPages: work.pageCount } : {}),
    author: { "@type": "Person", name: work.author.penName },
    publisher: { "@type": "Organization", name: "GeBook" },
    ...(availableFormats.length > 0
      ? {
          offers: availableFormats.map((format) => ({
            "@type": "Offer",
            price: format.price,
            priceCurrency: format.currency,
            availability: "https://schema.org/InStock",
          })),
        }
      : {}),
  };
}
