import Link from "next/link";
import type { Metadata } from "next";

import { BookGrid } from "@/src/components/catalog/book-grid";
import { CatalogFilters } from "@/src/components/catalog/catalog-filters";
import { Pagination } from "@/src/components/catalog/pagination";
import { Container, PageHeader } from "@/src/components/layout/page-shell";
import { Button } from "@/src/components/ui/button";
import { fetchCategories, fetchWorks, isFormatType } from "@/src/lib/catalog";
import { stripRichText } from "@/src/lib/rich-text";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Tout le catalogue GeBook : romans, essais et manuels d’auteurs africains, en PDF et papier.",
  alternates: { canonical: "/livres" },
};

export default async function CatalogPage(props: PageProps<"/livres">) {
  const searchParams = await props.searchParams;

  const q = firstValue(searchParams.q) ?? "";
  const category = firstValue(searchParams.category) ?? "";
  const format = firstValue(searchParams.format) ?? "";
  const page = Math.max(1, Number(firstValue(searchParams.page)) || 1);

  const [works, categories] = await Promise.all([
    fetchWorks({
      q: q || undefined,
      category: category || undefined,
      format: isFormatType(format) ? format : undefined,
      page,
    }),
    fetchCategories(),
  ]);

  const hasFilters = q !== "" || category !== "" || format !== "";
  const activeCategory = categories.find((item) => item.slug === category);

  return (
    <Container size="wide" className="pb-20">
      <PageHeader
        eyebrow="Catalogue"
        title={activeCategory ? activeCategory.name : "Tous les ouvrages de la maison"}
        description={
          stripRichText(activeCategory?.description) ||
          "Romans, essais et manuels publiés par nos éditeurs et auteurs. Chaque œuvre indique les formats réellement disponibles et leur prix."
        }
      />

      <CatalogFilters
        categories={categories}
        current={{ q, category, format }}
        resultCount={works.meta.total}
      />

      <div className="mt-10">
        <BookGrid
          works={works.data}
          priorityCount={4}
          emptyTitle={
            hasFilters
              ? "Aucun ouvrage ne correspond à cette recherche"
              : "Le catalogue est encore vide"
          }
          emptyDescription={
            hasFilters
              ? "Essayez un autre mot-clé, élargissez le domaine ou retirez le filtre de format."
              : "Les premiers ouvrages seront publiés très prochainement."
          }
          emptyAction={
            hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/livres">Réinitialiser la recherche</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/auteurs">Découvrir les auteurs</Link>
              </Button>
            )
          }
        />
      </div>

      <Pagination
        page={works.meta.page}
        totalPages={works.meta.totalPages}
        buildHref={(targetPage) =>
          buildCatalogHref({ q, category, format, page: targetPage })
        }
      />
    </Container>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildCatalogHref(filters: {
  q: string;
  category: string;
  format: string;
  page: number;
}): string {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.format) params.set("format", filters.format);
  if (filters.page > 1) params.set("page", String(filters.page));

  const query = params.toString();
  return query ? `/livres?${query}` : "/livres";
}
