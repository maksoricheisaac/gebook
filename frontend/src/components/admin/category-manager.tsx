"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  BookText,
  CheckCircle2,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AdminPagination } from "@/src/components/admin/admin-pagination";
import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { ConfirmDialog } from "@/src/components/admin/confirm-dialog";
import { LocaleTabs } from "@/src/components/admin/locale-tabs";
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
import { Input } from "@/src/components/ui/input";
import { RichTextEditor } from "@/src/components/ui/rich-text-editor";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { slugify } from "@/src/lib/slugify";
import { emptyToUndefined, hasAnyValue } from "@/src/lib/translation-form";

interface CategoryTranslation {
  locale: "fr" | "en";
  name: string;
  description: string | null;
}

interface Category {
  id: string;
  /** Colonne historique (Phase 1 « bilinguisme ») : encore fiable pour un
   * affichage simple (liste, en-tête), la source pour l'édition reste
   * `translations`. */
  name: string;
  slug: string;
  status: "active" | "inactive";
  translations: CategoryTranslation[];
  _count: { works: number };
}

interface CategoryStats {
  total: number;
  active: number;
  inactive: number;
  totalWorks: number;
  avgWorksPerCategory: number | null;
}

interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const PER_PAGE = 20;

const categoryTranslationFieldsSchema = z.object({
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().optional(),
});

const categorySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est obligatoire.")
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement."),
    translations: z.object({
      fr: categoryTranslationFieldsSchema,
      en: categoryTranslationFieldsSchema,
    }),
  })
  .superRefine((values, ctx) => {
    if (!values.translations.fr.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le nom est obligatoire.",
        path: ["translations", "fr", "name"],
      });
    }

    const en = values.translations.en;
    if (hasAnyValue({ description: en.description }) && !en.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ajoutez un nom anglais pour publier cette traduction.",
        path: ["translations", "en", "name"],
      });
    }
  });

type CategoryFormValues = z.infer<typeof categorySchema>;

const EMPTY_CATEGORIES: Category[] = [];

const EMPTY: CategoryFormValues = {
  slug: "",
  translations: {
    fr: { name: "", description: "" },
    en: { name: "", description: "" },
  },
};

/** Voir le commentaire équivalent dans `work-editor.tsx`. */
function buildTranslationsPayload(values: CategoryFormValues): {
  fr: { name: string; description?: string };
  en?: { name: string; description?: string };
} {
  const fr = values.translations.fr;
  const en = values.translations.en;
  const enHasContent = hasAnyValue({ name: en.name, description: en.description });

  return {
    fr: {
      name: fr.name!.trim(),
      description: emptyToUndefined(fr.description),
    },
    ...(enHasContent && {
      en: {
        name: en.name!.trim(),
        description: emptyToUndefined(en.description),
      },
    }),
  };
}

export function CategoryManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "categories", page, search],
    queryFn: () =>
      adminFetch<Paginated<Category>>(
        `/categories?page=${page}&perPage=${PER_PAGE}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "categories", "stats"],
    queryFn: () => adminFetch<CategoryStats>("/categories/stats"),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY,
  });

  const nameValue = watch("translations.fr.name");

  useEffect(() => {
    // Le slug se propose depuis le nom, uniquement à la création : modifier le
    // nom d'une catégorie existante ne doit pas déplacer son URL sous les pieds
    // de qui l'a déjà partagée.
    if (!editing) {
      setValue("slug", slugify(nameValue ?? ""));
    }
  }, [nameValue, editing, setValue]);

  const enFields = useWatch({ control, name: "translations.en" });
  const isEnTranslated = hasAnyValue({
    name: enFields?.name,
    description: enFields?.description,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });

  const createMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      adminFetch<Category>("/categories", {
        method: "POST",
        body: { slug: values.slug, translations: buildTranslationsPayload(values) },
      }),
    onSuccess: async (category) => {
      reset(EMPTY);
      setServerError(null);
      setIsFormOpen(false);
      toast.success(`Catégorie « ${category.name} » créée.`);
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (values: CategoryFormValues & { id: string }) =>
      adminFetch<Category>(`/categories/${values.id}`, {
        method: "PATCH",
        body: { slug: values.slug, translations: buildTranslationsPayload(values) },
      }),
    onSuccess: async (category) => {
      setEditing(null);
      reset(EMPTY);
      setServerError(null);
      setIsFormOpen(false);
      toast.success(`Catégorie « ${category.name} » modifiée.`);
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch<void>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      const name = toDelete?.name;
      setToDelete(null);
      setServerError(null);
      toast.success(name ? `Catégorie « ${name} » supprimée.` : "Catégorie supprimée.");
      await invalidate();
    },
    onError: (error: unknown) => {
      setToDelete(null);
      toast.error(errorMessage(error));
    },
  });

  const startCreate = (): void => {
    setEditing(null);
    setServerError(null);
    reset(EMPTY);
    setIsFormOpen(true);
  };

  const startEdit = (category: Category): void => {
    setEditing(category);
    setServerError(null);
    const fr = category.translations.find((t) => t.locale === "fr");
    const en = category.translations.find((t) => t.locale === "en");
    reset({
      slug: category.slug,
      translations: {
        fr: {
          name: fr?.name ?? category.name,
          description: fr?.description ?? "",
        },
        en: {
          name: en?.name ?? "",
          description: en?.description ?? "",
        },
      },
    });
    setIsFormOpen(true);
  };

  const categories = data?.data ?? EMPTY_CATEGORIES;

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard
          label="Catégories"
          value={stats?.total ?? data?.meta.total ?? 0}
          icon={FolderTree}
        />
        <AdminStatCard label="Actives" value={stats?.active ?? 0} icon={CheckCircle2} />
        <AdminStatCard label="Inactives" value={stats?.inactive ?? 0} icon={XCircle} />
        <AdminStatCard
          label="Livres / catégorie"
          value={
            stats?.avgWorksPerCategory != null
              ? stats.avgWorksPerCategory.toFixed(1)
              : "—"
          }
          icon={BookText}
          hint={
            stats
              ? `${stats.totalWorks} œuvre${stats.totalWorks > 1 ? "s" : ""} au total`
              : undefined
          }
        />
      </AdminStatGrid>

      <AdminTablePanel
        title="Catégories"
        description={data ? `${data.meta.total} au total.` : undefined}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full pl-8 sm:w-48"
                aria-label="Rechercher une catégorie"
              />
            </div>
            <Button type="button" size="sm" onClick={startCreate}>
              <Plus aria-hidden />
              Nouvelle catégorie
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : isError ? (
          <RetryRow onRetry={() => void refetch()} label="catégories" />
        ) : (
          <>
            <DataTable
              caption="Catégories du catalogue"
              className="rounded-none border-0"
              head={
                <>
                  <th scope="col">Nom</th>
                  <th scope="col">Adresse</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Livres</th>
                  <th scope="col" className="text-right!">
                    Actions
                  </th>
                </>
              }
            >
              {categories.length === 0 ? (
                <DataRowFull colSpan={5}>
                  {search
                    ? "Aucune catégorie ne correspond à cette recherche."
                    : "Aucune catégorie pour le moment."}
                </DataRowFull>
              ) : (
                categories.map((category) => (
                  <DataRow key={category.id}>
                    <td className="text-secondary font-medium">{category.name}</td>
                    <td className="text-muted-foreground">/{category.slug}</td>
                    <td>
                      <Badge
                        variant={category.status === "active" ? "success" : "neutral"}
                      >
                        {category.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="tabular-nums">{category._count.works}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(category)}
                        >
                          <Pencil aria-hidden />
                          Modifier
                          <span className="sr-only"> — {category.name}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive-muted"
                          onClick={() => setToDelete(category)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Supprimer {category.name}</span>
                        </Button>
                      </div>
                    </td>
                  </DataRow>
                ))
              )}
            </DataTable>
            {data && (
              <AdminPagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
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
            setEditing(null);
            setServerError(null);
            reset(EMPTY);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Modifier « ${editing.name} »` : "Nouvelle catégorie"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((values) =>
              editing
                ? updateMutation.mutate({ ...values, id: editing.id })
                : createMutation.mutate(values),
            )}
          >
            <DialogBody className="space-y-5">
              <FormError message={serverError ?? undefined} />

              <Field
                id="category-slug"
                label="Adresse (slug)"
                required
                error={errors.slug?.message}
              >
                <Input {...register("slug")} />
              </Field>

              <LocaleTabs
                isEnTranslated={isEnTranslated}
                fr={
                  <>
                    <Field
                      id="category-name-fr"
                      label="Nom"
                      required
                      error={errors.translations?.fr?.name?.message}
                    >
                      <Input {...register("translations.fr.name")} />
                    </Field>

                    <Controller
                      control={control}
                      name="translations.fr.description"
                      render={({ field }) => (
                        <Field
                          id="category-description-fr"
                          label="Description"
                          hint="Affichée en tête du catalogue filtré sur ce domaine."
                          optional
                        >
                          <RichTextEditor
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Ce que rassemble ce domaine…"
                          />
                        </Field>
                      )}
                    />
                  </>
                }
                en={
                  <>
                    <Field
                      id="category-name-en"
                      label="Name"
                      optional={!isEnTranslated}
                      error={errors.translations?.en?.name?.message}
                    >
                      <Input {...register("translations.en.name")} />
                    </Field>

                    <Controller
                      control={control}
                      name="translations.en.description"
                      render={({ field }) => (
                        <Field
                          id="category-description-en"
                          label="Description"
                          hint="Shown at the top of the catalogue filtered on this category."
                          optional
                        >
                          <RichTextEditor
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="What this category covers…"
                          />
                        </Field>
                      )}
                    />
                  </>
                }
              />
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                isLoading={
                  isSubmitting || createMutation.isPending || updateMutation.isPending
                }
              >
                {!editing && <Plus aria-hidden />}
                {editing ? "Enregistrer les modifications" : "Créer la catégorie"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette catégorie ?"
        description={
          toDelete
            ? `« ${toDelete.name} » disparaîtra des filtres du catalogue. Les œuvres qui y sont rattachées ne seront pas supprimées.`
            : ""
        }
        confirmLabel="Supprimer la catégorie"
        isPending={deleteMutation.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}
