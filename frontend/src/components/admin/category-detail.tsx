"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BookText } from "lucide-react";

import { AdminPageHeader, AdminPanel } from "@/src/components/admin/admin-page";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { RichText } from "@/src/components/ui/rich-text";
import { Skeleton } from "@/src/components/ui/states";
import { adminFetch } from "@/src/lib/admin-api";
import {
  WORK_STATUS_LABELS,
  workStatusTone,
  type WorkStatus,
} from "@/src/lib/work-status";

interface CategoryTranslation {
  locale: "fr" | "en";
  name: string;
  description: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  translations: CategoryTranslation[];
  _count: { works: number };
}

interface CategoryWork {
  id: string;
  title: string;
  slug: string;
  status: WorkStatus;
  authorId: string;
  publishedAt: string | null;
}

interface AuthorOption {
  id: string;
  penName: string;
}

interface Paginated<T> {
  data: T[];
}

const STATUS_LABELS: Record<Category["status"], string> = {
  active: "Active",
  inactive: "Inactive",
};

const STATUS_TONES: Record<Category["status"], "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
};

/**
 * Fiche d'une catégorie — lecture seule : la modification (nom, slug,
 * description) reste dans la modale de `CategoryManager`, déjà en place et
 * suffisante pour ce geste ponctuel. Cette page répond à un besoin différent
 * — voir d'un coup d'œil ce qu'une catégorie contient réellement, ce
 * qu'aucune vue ne permettait jusqu'ici (le tableau des catégories ne montre
 * qu'un compte, pas la liste).
 */
export function CategoryDetail({ categoryId }: { categoryId: string }) {
  const { data: category, isLoading } = useQuery({
    queryKey: ["admin", "categories", categoryId],
    queryFn: () => adminFetch<Category>(`/categories/${categoryId}`),
  });

  const { data: works } = useQuery({
    queryKey: ["admin", "works", "by-category", categoryId],
    queryFn: () =>
      adminFetch<Paginated<CategoryWork>>(`/works?categoryId=${categoryId}&perPage=100`),
    enabled: Boolean(category),
  });

  const { data: authors } = useQuery({
    queryKey: ["admin", "authors", "options"],
    queryFn: () => adminFetch<Paginated<AuthorOption>>("/authors?perPage=100"),
  });

  if (isLoading || !category) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const fr = category.translations.find((t) => t.locale === "fr");
  const en = category.translations.find((t) => t.locale === "en");

  return (
    <div className="space-y-6">
      <Link
        href="/admin/categories"
        className="text-muted-foreground hover:text-secondary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Toutes les catégories
      </Link>

      <AdminPageHeader
        title={category.name}
        description={`/livres?category=${category.slug}`}
        actions={
          <Badge variant={STATUS_TONES[category.status]}>
            {STATUS_LABELS[category.status]}
          </Badge>
        }
      />

      <AdminPanel title="Informations">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="type-caption">Nom (français)</dt>
            <dd className="text-secondary mt-1 text-sm font-medium">
              {fr?.name ?? category.name}
            </dd>
          </div>
          <div>
            <dt className="type-caption">Nom (anglais)</dt>
            <dd className="text-secondary mt-1 text-sm font-medium">
              {en?.name ?? "Non traduit"}
            </dd>
          </div>
        </dl>

        {fr?.description && (
          <div className="mt-5">
            <dt className="type-caption">Description</dt>
            <div className="mt-1.5">
              <RichText html={fr.description} />
            </div>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Livres associés"
        description={`${category._count.works} œuvre${category._count.works > 1 ? "s" : ""}.`}
      >
        <DataTable
          caption={`Œuvres de la catégorie ${category.name}`}
          className="rounded-none border-0"
          head={
            <>
              <th scope="col">Titre</th>
              <th scope="col">Auteur</th>
              <th scope="col">Statut</th>
              <th scope="col" className="text-right!">
                Action
              </th>
            </>
          }
        >
          {!works || works.data.length === 0 ? (
            <DataRowFull colSpan={4}>
              Aucun livre rattaché à cette catégorie pour le moment.
            </DataRowFull>
          ) : (
            works.data.map((work) => (
              <DataRow key={work.id}>
                <td>
                  <p className="text-secondary font-medium">{work.title}</p>
                  <p className="type-caption">/livres/{work.slug}</p>
                </td>
                <td className="text-muted-foreground">
                  {authors?.data.find((author) => author.id === work.authorId)?.penName ??
                    "—"}
                </td>
                <td>
                  <Badge variant={workStatusTone(work.status)}>
                    {WORK_STATUS_LABELS[work.status]}
                  </Badge>
                </td>
                <td className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/oeuvres/${work.id}`}>
                      <BookText aria-hidden />
                      Gérer
                    </Link>
                  </Button>
                </td>
              </DataRow>
            ))
          )}
        </DataTable>
      </AdminPanel>
    </div>
  );
}
