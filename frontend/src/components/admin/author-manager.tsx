"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { BookText, CheckCircle2, Plus, Search, Trash2, UserSquare2 } from "lucide-react";
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
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { slugify } from "@/src/lib/slugify";
import { emptyToUndefined, hasAnyValue } from "@/src/lib/translation-form";

interface AuthorTranslation {
  locale: "fr" | "en";
  biography: string | null;
  shortBiography: string | null;
}

interface Author {
  id: string;
  penName: string;
  slug: string;
  photoPath: string | null;
  country: string | null;
  city: string | null;
  status: "draft" | "active" | "inactive";
  translations: AuthorTranslation[];
  _count: { works: number };
}

interface AuthorStats {
  total: number;
  active: number;
  noPhoto: number;
  totalWorks: number;
  avgWorksPerAuthor: number | null;
}

interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const PER_PAGE = 20;

const authorTranslationFieldsSchema = z.object({
  shortBiography: z.string().trim().max(500).optional(),
  biography: z.string().trim().optional(),
});

const authorSchema = z.object({
  penName: z.string().trim().min(1, "Le nom de plume est obligatoire.").max(150),
  slug: z
    .string()
    .trim()
    .min(1, "Le slug est obligatoire.")
    .max(180)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement."),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  status: z.enum(["draft", "active", "inactive"]),
  translations: z.object({
    fr: authorTranslationFieldsSchema,
    en: authorTranslationFieldsSchema,
  }),
});

type AuthorFormValues = z.infer<typeof authorSchema>;

const STATUS_LABELS: Record<Author["status"], string> = {
  draft: "Brouillon",
  active: "Actif",
  inactive: "Inactif",
};

const STATUS_TONES: Record<Author["status"], "warning" | "success" | "neutral"> = {
  draft: "warning",
  active: "success",
  inactive: "neutral",
};

const EMPTY_AUTHORS: Author[] = [];

const EMPTY: AuthorFormValues = {
  penName: "",
  slug: "",
  country: "",
  city: "",
  status: "draft",
  translations: {
    fr: { shortBiography: "", biography: "" },
    en: { shortBiography: "", biography: "" },
  },
};

/**
 * Ne transmet le bloc `en` que s'il contient réellement quelque chose — voir
 * le commentaire équivalent dans `work-editor.tsx`. Contrairement à l'œuvre,
 * aucun champ auteur n'est obligatoire : `fr` part toujours, même vide, un
 * profil sans biographie étant un état légitime.
 */
function buildTranslationsPayload(values: AuthorFormValues): {
  fr: { shortBiography?: string; biography?: string };
  en?: { shortBiography?: string; biography?: string };
} {
  const fr = values.translations.fr;
  const en = values.translations.en;
  const enHasContent = hasAnyValue({
    shortBiography: en.shortBiography,
    biography: en.biography,
  });

  return {
    fr: {
      shortBiography: emptyToUndefined(fr.shortBiography),
      biography: emptyToUndefined(fr.biography),
    },
    ...(enHasContent && {
      en: {
        shortBiography: emptyToUndefined(en.shortBiography),
        biography: emptyToUndefined(en.biography),
      },
    }),
  };
}

export function AuthorManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Author | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Cf. le commentaire équivalent dans `work-list.tsx` : une recherche qui
  // change doit ramener à la page 1.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "authors", page, search],
    queryFn: () =>
      adminFetch<Paginated<Author>>(
        `/authors?page=${page}&perPage=${PER_PAGE}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "authors", "stats"],
    queryFn: () => adminFetch<AuthorStats>("/authors/stats"),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AuthorFormValues>({
    resolver: zodResolver(authorSchema),
    defaultValues: EMPTY,
  });

  const penNameValue = watch("penName");

  useEffect(() => {
    setValue("slug", slugify(penNameValue));
  }, [penNameValue, setValue]);

  const enFields = useWatch({ control, name: "translations.en" });
  const isEnTranslated = hasAnyValue({
    shortBiography: enFields?.shortBiography,
    biography: enFields?.biography,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "authors"] });

  const createMutation = useMutation({
    mutationFn: (values: AuthorFormValues) =>
      adminFetch<Author>("/authors", {
        method: "POST",
        body: {
          penName: values.penName,
          slug: values.slug,
          country: values.country,
          city: values.city,
          status: values.status,
          translations: buildTranslationsPayload(values),
        },
      }),
    onSuccess: async (author) => {
      reset(EMPTY);
      setServerError(null);
      setIsFormOpen(false);
      toast.success(`Auteur « ${author.penName} » créé.`);
      await invalidate();
      router.push(`/admin/auteurs/${author.id}`);
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch<void>(`/authors/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      const name = toDelete?.penName;
      setToDelete(null);
      toast.success(name ? `Auteur « ${name} » supprimé.` : "Auteur supprimé.");
      await invalidate();
    },
    onError: (error: unknown) => {
      setToDelete(null);
      toast.error(errorMessage(error));
    },
  });

  const startCreate = (): void => {
    setServerError(null);
    reset(EMPTY);
    setIsFormOpen(true);
  };

  const authors = data?.data ?? EMPTY_AUTHORS;

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard
          label="Auteurs"
          value={stats?.total ?? data?.meta.total ?? 0}
          icon={UserSquare2}
        />
        <AdminStatCard label="Actifs" value={stats?.active ?? 0} icon={CheckCircle2} />
        <AdminStatCard label="Sans photo" value={stats?.noPhoto ?? 0} />
        <AdminStatCard
          label="Livres / auteur"
          value={
            stats?.avgWorksPerAuthor != null ? stats.avgWorksPerAuthor.toFixed(1) : "—"
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
        title="Auteurs"
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
                aria-label="Rechercher un auteur"
              />
            </div>
            <Button type="button" size="sm" onClick={startCreate}>
              <Plus aria-hidden />
              Nouvel auteur
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : isError ? (
          <RetryRow onRetry={() => void refetch()} label="fiches auteur" />
        ) : (
          <>
            <DataTable
              caption="Auteurs publiés"
              className="rounded-none border-0"
              head={
                <>
                  <th scope="col">Nom de plume</th>
                  <th scope="col">Adresse</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Livres</th>
                  <th scope="col" className="text-right!">
                    Actions
                  </th>
                </>
              }
            >
              {authors.length === 0 ? (
                <DataRowFull colSpan={5}>
                  {search
                    ? "Aucun auteur ne correspond à cette recherche."
                    : "Aucun auteur pour le moment."}
                </DataRowFull>
              ) : (
                authors.map((author) => (
                  <DataRow key={author.id}>
                    <td className="text-secondary font-medium">{author.penName}</td>
                    <td className="text-muted-foreground">/auteurs/{author.slug}</td>
                    <td>
                      <Badge variant={STATUS_TONES[author.status]}>
                        {STATUS_LABELS[author.status]}
                      </Badge>
                    </td>
                    <td className="tabular-nums">{author._count.works}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/auteurs/${author.id}`}>
                            Gérer
                            <span className="sr-only"> — {author.penName}</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive-muted"
                          onClick={() => setToDelete(author)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">Supprimer {author.penName}</span>
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
            setServerError(null);
            reset(EMPTY);
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Nouvel auteur</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
            <DialogBody className="space-y-5">
              <FormError message={serverError ?? undefined} />
              <p className="text-muted-foreground text-sm">
                Le nom de plume, l’adresse et le statut suffisent pour commencer. La photo
                et la biographie s’ajoutent ensuite sur la fiche de l’auteur.
              </p>

              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  id="author-pen-name"
                  label="Nom de plume"
                  required
                  error={errors.penName?.message}
                >
                  <Input {...register("penName")} />
                </Field>

                <Field
                  id="author-slug"
                  label="Adresse (slug)"
                  required
                  error={errors.slug?.message}
                >
                  <Input {...register("slug")} />
                </Field>

                <Field id="author-country" label="Pays" optional>
                  <Input {...register("country")} />
                </Field>

                <Field id="author-city" label="Ville" optional>
                  <Input {...register("city")} />
                </Field>
              </div>

              <Field
                id="author-status"
                label="Statut"
                hint="Seuls les auteurs actifs apparaissent sur le site public."
              >
                <Select {...register("status")} className="md:w-56">
                  <option value="draft">Brouillon</option>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </Select>
              </Field>

              <LocaleTabs
                isEnTranslated={isEnTranslated}
                fr={
                  <>
                    <Field
                      id="author-short-bio-fr"
                      label="Biographie courte"
                      hint="Affichée dans la liste des auteurs. 500 caractères maximum."
                      optional
                      error={errors.translations?.fr?.shortBiography?.message}
                    >
                      <Textarea
                        rows={2}
                        {...register("translations.fr.shortBiography")}
                      />
                    </Field>

                    <Field
                      id="author-bio-fr"
                      label="Biographie complète"
                      hint="Affichée sur la fiche de l’auteur."
                      optional
                    >
                      <Textarea rows={5} {...register("translations.fr.biography")} />
                    </Field>
                  </>
                }
                en={
                  <>
                    <Field
                      id="author-short-bio-en"
                      label="Short biography"
                      hint="Shown in the authors list. 500 characters maximum."
                      optional
                      error={errors.translations?.en?.shortBiography?.message}
                    >
                      <Textarea
                        rows={2}
                        {...register("translations.en.shortBiography")}
                      />
                    </Field>

                    <Field
                      id="author-bio-en"
                      label="Full biography"
                      hint="Shown on the author's page."
                      optional
                    >
                      <Textarea rows={5} {...register("translations.en.biography")} />
                    </Field>
                  </>
                }
              />
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" isLoading={isSubmitting || createMutation.isPending}>
                <Plus aria-hidden />
                Créer l’auteur
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cet auteur ?"
        description={
          toDelete
            ? `La fiche de « ${toDelete.penName} » sera retirée. Cette action échouera si des œuvres lui sont encore rattachées.`
            : ""
        }
        confirmLabel="Supprimer l’auteur"
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
