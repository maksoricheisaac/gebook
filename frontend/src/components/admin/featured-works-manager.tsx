"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";
import { toast } from "sonner";

import { AdminPagination } from "@/src/components/admin/admin-pagination";
import { AdminTablePanel } from "@/src/components/admin/admin-page";
import { Badge } from "@/src/components/ui/badge";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { Input } from "@/src/components/ui/input";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { resolveAssetUrl } from "@/src/lib/assets";

interface FeaturableWork {
  id: string;
  title: string;
  slug: string;
  coverPath: string | null;
  featured: boolean;
  featuredRank: number | null;
  author: { penName: string };
  tenant: { name: string };
}

interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const PER_PAGE = 20;

/**
 * Curation « à la une » — plateforme entière, SuperAdmin uniquement.
 *
 * Distinct de `WorkList` (le catalogue d'un espace) : cette liste porte sur
 * les œuvres *publiées*, tous tenants confondus (`GET /admin/works/featured`,
 * `@Roles('admin')`), parce que la mise en avant est une décision de
 * curation plateforme — jamais un geste qu'un membre de tenant ou un auteur
 * peut poser sur sa propre œuvre (voir `SetFeaturedDto`, backend).
 */
export function FeaturedWorksManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rankDrafts, setRankDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- même idiome que `cart-provider.tsx`
    setPage(1);
  }, [search]);

  const {
    data: works,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "works", "featured", page, search],
    queryFn: () =>
      adminFetch<Paginated<FeaturableWork>>(
        `/works/featured?page=${page}&perPage=${PER_PAGE}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "works", "featured"] });

  const setFeatured = useMutation({
    mutationFn: ({
      id,
      featured,
      featuredRank,
    }: {
      id: string;
      featured: boolean;
      featuredRank?: number;
    }) =>
      adminFetch<FeaturableWork>(`/works/featured/${id}`, {
        method: "PATCH",
        body: { featured, featuredRank },
      }),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(
        error instanceof AdminApiError ? error.message : "Une erreur est survenue.",
      );
    },
  });

  const items = works?.data ?? [];

  const rankValue = (work: FeaturableWork): string =>
    rankDrafts[work.id] ?? (work.featuredRank != null ? String(work.featuredRank) : "");

  const commitRank = (work: FeaturableWork): void => {
    const raw = rankDrafts[work.id];
    if (raw === undefined) return;

    const parsed = raw.trim() === "" ? undefined : Number(raw);
    if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 1)) {
      toast.error("La priorité doit être un nombre entier positif.");
      return;
    }

    setFeatured.mutate({ id: work.id, featured: true, featuredRank: parsed });
    setRankDrafts((drafts) => {
      const next = { ...drafts };
      delete next[work.id];
      return next;
    });
  };

  return (
    <AdminTablePanel
      title="Œuvres mises en avant"
      description={
        works
          ? `${works.meta.total} œuvre${works.meta.total > 1 ? "s" : ""} publiée${works.meta.total > 1 ? "s" : ""} au total.`
          : undefined
      }
      actions={
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            placeholder="Rechercher un titre…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full pl-8 sm:w-64"
            aria-label="Rechercher une œuvre publiée"
          />
        </div>
      }
    >
      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : isError ? (
        <RetryRow onRetry={() => void refetch()} label="œuvres" />
      ) : (
        <>
          <DataTable
            caption="Œuvres publiées, mise en avant et priorité"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">Œuvre</th>
                <th scope="col">Auteur</th>
                <th scope="col">Espace</th>
                <th scope="col">À la une</th>
                <th scope="col">Priorité</th>
              </>
            }
          >
            {items.length === 0 ? (
              <DataRowFull colSpan={5}>
                {search
                  ? "Aucune œuvre publiée ne correspond à cette recherche."
                  : "Aucune œuvre publiée pour le moment."}
              </DataRowFull>
            ) : (
              items.map((work) => (
                <DataRow key={work.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="bg-paper-200 ring-ink-900/10 relative h-14 w-10 shrink-0 overflow-hidden rounded-sm ring-1">
                        {work.coverPath && (
                          // eslint-disable-next-line @next/next/no-img-element -- vignette d'administration
                          <img
                            src={resolveAssetUrl(work.coverPath)!}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-secondary truncate font-medium">
                          {work.title}
                        </p>
                        <p className="type-caption truncate">/livres/{work.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-muted-foreground">{work.author.penName}</td>
                  <td className="text-muted-foreground">{work.tenant.name}</td>
                  <td>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-primary size-4 cursor-pointer"
                        checked={work.featured}
                        disabled={setFeatured.isPending}
                        onChange={(event) =>
                          setFeatured.mutate({
                            id: work.id,
                            featured: event.target.checked,
                            featuredRank: work.featuredRank ?? undefined,
                          })
                        }
                      />
                      {work.featured && (
                        <Badge variant="accent">
                          <Star aria-hidden className="size-3" />À la une
                        </Badge>
                      )}
                    </label>
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      disabled={!work.featured || setFeatured.isPending}
                      value={rankValue(work)}
                      onChange={(event) =>
                        setRankDrafts((drafts) => ({
                          ...drafts,
                          [work.id]: event.target.value,
                        }))
                      }
                      onBlur={() => commitRank(work)}
                      placeholder="—"
                      className="h-9 w-20"
                      aria-label={`Priorité de « ${work.title} »`}
                    />
                  </td>
                </DataRow>
              ))
            )}
          </DataTable>
          {works && (
            <AdminPagination
              page={works.meta.page}
              totalPages={works.meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </AdminTablePanel>
  );
}
