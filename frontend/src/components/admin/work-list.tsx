"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BookText, CheckCircle2, FileEdit, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPagination } from "@/src/components/admin/admin-pagination";
import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { ConfirmDialog } from "@/src/components/admin/confirm-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select } from "@/src/components/ui/input";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { slugify } from "@/src/lib/slugify";
import {
  WORK_STATUS_LABELS,
  workStatusTone,
  type WorkStatus,
} from "@/src/lib/work-status";

interface WorkListItem {
  id: string;
  title: string;
  slug: string;
  status: WorkStatus;
}

interface WorkStats {
  total: number;
  published: number;
  submitted: number;
  draft: number;
}

interface AuthorOption {
  id: string;
  penName: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const PER_PAGE = 20;

const workSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(255),
  slug: z
    .string()
    .trim()
    .min(1, "Le slug est obligatoire.")
    .max(280)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement."),
  authorId: z.string().min(1, "Choisissez un auteur."),
  categoryId: z.string().optional(),
});

type WorkFormValues = z.infer<typeof workSchema>;

const EMPTY: WorkFormValues = { title: "", slug: "", authorId: "", categoryId: "" };

/**
 * Liste des œuvres et création rapide.
 *
 * Le formulaire de création — réduit à trois champs, titre/slug/auteur, puis
 * l'éditeur complet prend le relais — vit désormais dans une modale plutôt
 * que directement sur la page (cohérence avec les autres modules du
 * back-office). La pagination et la recherche passent par le serveur
 * (`AdminListQuery`, déjà supporté par l'API) plutôt que de tout charger
 * puis filtrer en mémoire : une liste de plusieurs centaines d'œuvres
 * n'aurait plus tenu dans une seule page de 100.
 */
export function WorkList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<WorkListItem | null>(null);

  // Un changement de recherche doit revenir à la page 1 : rester en page 4
  // d'une recherche qui n'a plus que 2 pages de résultats afficherait une
  // liste vide sans que rien ne l'explique.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const {
    data: works,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "works", page, search],
    queryFn: () =>
      adminFetch<Paginated<WorkListItem>>(
        `/works?page=${page}&perPage=${PER_PAGE}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "works", "stats"],
    queryFn: () => adminFetch<WorkStats>("/works/stats"),
  });

  const { data: authors } = useQuery({
    queryKey: ["admin", "authors", "options"],
    queryFn: () => adminFetch<Paginated<AuthorOption>>("/authors?perPage=100"),
  });

  const { data: categories } = useQuery({
    queryKey: ["admin", "categories", "options"],
    queryFn: () => adminFetch<Paginated<CategoryOption>>("/categories?perPage=100"),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkFormValues>({
    resolver: zodResolver(workSchema),
    defaultValues: EMPTY,
  });

  const titleValue = watch("title");

  useEffect(() => {
    setValue("slug", slugify(titleValue));
  }, [titleValue, setValue]);

  const createMutation = useMutation({
    mutationFn: (values: WorkFormValues) =>
      adminFetch<{ id: string }>("/works", {
        method: "POST",
        // Création rapide : le reste — sous-titre, accroche, présentation,
        // traduction anglaise — s'édite ensuite dans `WorkEditor` (Phase 1
        // « bilinguisme »). Seul `fr.title` est requis à cette étape.
        body: {
          authorId: values.authorId,
          categoryId: values.categoryId || undefined,
          slug: values.slug,
          translations: { fr: { title: values.title } },
        },
      }),
    onSuccess: async (work) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "works"] });
      toast.success("Œuvre créée.");
      setIsFormOpen(false);
      reset(EMPTY);
      router.push(`/admin/oeuvres/${work.id}`);
    },
    onError: (error: unknown) => {
      setServerError(
        error instanceof AdminApiError ? error.message : "Une erreur est survenue.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch<void>(`/works/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      const title = toDelete?.title;
      setToDelete(null);
      toast.success(title ? `Œuvre « ${title} » supprimée.` : "Œuvre supprimée.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "works"] });
    },
    onError: (error: unknown) => {
      setToDelete(null);
      toast.error(
        error instanceof AdminApiError ? error.message : "Une erreur est survenue.",
      );
    },
  });

  const startCreate = (): void => {
    setServerError(null);
    reset(EMPTY);
    setIsFormOpen(true);
  };

  const items = works?.data ?? [];

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard
          label="Œuvres"
          value={stats?.total ?? works?.meta.total ?? 0}
          icon={BookText}
        />
        <AdminStatCard
          label="Publiées"
          value={stats?.published ?? 0}
          icon={CheckCircle2}
        />
        <AdminStatCard label="À relire" value={stats?.submitted ?? 0} icon={FileEdit} />
        <AdminStatCard label="Brouillons" value={stats?.draft ?? 0} icon={FileEdit} />
      </AdminStatGrid>

      <AdminTablePanel
        title="Toutes les œuvres"
        description={
          works ? `${works.meta.total} au total, tous statuts confondus.` : undefined
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
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
                className="h-9 w-full pl-8 sm:w-56"
                aria-label="Rechercher une œuvre"
              />
            </div>
            <Button type="button" size="sm" onClick={startCreate}>
              <Plus aria-hidden />
              Nouvelle œuvre
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={5} columns={3} />
        ) : isError ? (
          <RetryRow onRetry={() => void refetch()} label="œuvres" />
        ) : (
          <>
            <DataTable
              caption="Œuvres du catalogue"
              className="rounded-none border-0"
              head={
                <>
                  <th scope="col">Titre</th>
                  <th scope="col">Statut</th>
                  <th scope="col" className="text-right!">
                    Action
                  </th>
                </>
              }
            >
              {items.length === 0 ? (
                <DataRowFull colSpan={3}>
                  {search
                    ? "Aucune œuvre ne correspond à cette recherche."
                    : "Aucune œuvre pour le moment. Créez la première avec le bouton ci-dessus."}
                </DataRowFull>
              ) : (
                items.map((work) => (
                  <DataRow key={work.id}>
                    <td>
                      <p className="text-secondary font-medium">{work.title}</p>
                      <p className="type-caption">/livres/{work.slug}</p>
                    </td>
                    <td>
                      <Badge variant={workStatusTone(work.status)}>
                        {WORK_STATUS_LABELS[work.status]}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/oeuvres/${work.id}`}>
                            Gérer
                            <span className="sr-only"> — {work.title}</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive-muted"
                          onClick={() => setToDelete(work)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Supprimer {work.title}</span>
                        </Button>
                      </div>
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

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setServerError(null);
            reset(EMPTY);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle œuvre</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
            <DialogBody className="space-y-5">
              <FormError message={serverError ?? undefined} />
              <p className="text-muted-foreground text-sm">
                Le titre, l’adresse et l’auteur suffisent pour commencer. Le reste s’édite
                ensuite.
              </p>

              <Field id="work-title" label="Titre" required error={errors.title?.message}>
                <Input {...register("title")} autoFocus />
              </Field>

              <Field
                id="work-slug"
                label="Adresse (slug)"
                hint="Proposée depuis le titre."
                required
                error={errors.slug?.message}
              >
                <Input {...register("slug")} />
              </Field>

              <Field
                id="work-author"
                label="Auteur"
                required
                error={errors.authorId?.message}
              >
                <Select {...register("authorId")}>
                  <option value="">Choisir un auteur</option>
                  {authors?.data.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.penName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id="work-category" label="Domaine" optional>
                <Select {...register("categoryId")}>
                  <option value="">Aucun</option>
                  {categories?.data.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" isLoading={isSubmitting || createMutation.isPending}>
                <Plus aria-hidden />
                Créer et continuer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette œuvre ?"
        description={
          toDelete
            ? `« ${toDelete.title} » sera retirée du catalogue. Cette action échouera si l’œuvre a encore des commandes ou des exemplaires en bibliothèque.`
            : ""
        }
        confirmLabel="Supprimer l’œuvre"
        isPending={deleteMutation.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
    </div>
  );
}
