"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, ExternalLink, ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader, AdminPanel } from "@/src/components/admin/admin-page";
import { FormatManager } from "@/src/components/admin/format-manager";
import { LocaleTabs } from "@/src/components/admin/locale-tabs";
import { useTenant } from "@/src/components/providers/tenant-provider";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { resolveAssetUrl } from "@/src/lib/assets";
import { emptyToUndefined, hasAnyValue } from "@/src/lib/translation-form";
import {
  WORK_STATUS_LABELS,
  workStatusTone,
  type WorkStatus,
} from "@/src/lib/work-status";

interface WorkTranslation {
  locale: "fr" | "en";
  title: string;
  subtitle: string | null;
  shortDescription: string | null;
  description: string | null;
}

interface Work {
  id: string;
  /** Colonne historique (Phase 1 « bilinguisme ») : encore fiable pour un affichage
   * simple (en-tête, onglet du navigateur), la source pour l'édition reste
   * `translations`. */
  title: string;
  slug: string;
  coverPath: string | null;
  authorId: string;
  categoryId: string | null;
  status: WorkStatus;
  featured: boolean;
  translations: WorkTranslation[];
}

interface Option {
  id: string;
  name?: string;
  penName?: string;
}

interface Paginated<T> {
  data: T[];
}

const workTranslationFieldsSchema = z.object({
  title: z.string().trim().max(255).optional(),
  subtitle: z.string().trim().max(255).optional(),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().trim().optional(),
});

const workSchema = z
  .object({
    authorId: z.string().min(1, "Choisissez un auteur."),
    categoryId: z.string().optional(),
    status: z.enum(["draft", "submitted", "published", "inactive", "archived"]),
    featured: z.boolean(),
    translations: z.object({
      fr: workTranslationFieldsSchema,
      en: workTranslationFieldsSchema,
    }),
  })
  .superRefine((values, ctx) => {
    if (!values.translations.fr.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le titre est obligatoire.",
        path: ["translations", "fr", "title"],
      });
    }

    const en = values.translations.en;
    if (
      hasAnyValue({
        subtitle: en.subtitle,
        shortDescription: en.shortDescription,
        description: en.description,
      }) &&
      !en.title?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ajoutez un titre anglais pour publier cette traduction.",
        path: ["translations", "en", "title"],
      });
    }
  });

type WorkFormValues = z.infer<typeof workSchema>;

/**
 * Éditeur d'une œuvre.
 *
 * Trois blocs séparés — couverture, informations, formats — au lieu d'un seul
 * long formulaire. Le bouton d'enregistrement reste désactivé tant que rien n'a
 * changé (`isDirty`), et l'état de publication est visible en tête de page :
 * c'est la première question que se pose un éditeur en ouvrant une fiche.
 *
 * Le titre, le sous-titre, l'accroche et la présentation sont traduisibles
 * (Phase 1 « bilinguisme ») : `LocaleTabs` bascule entre le français — seule
 * langue obligatoire — et l'anglais, facultatif tant qu'aucun champ n'y est
 * rempli.
 */
export function WorkEditor({ workId }: { workId: string }) {
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement>(null);
  // Un membre "author" ne peut donner à sa propre œuvre que ces deux statuts
  // (règle miroir de `assertAllowedStatus` côté back-office) : publier reste
  // un geste éditorial. Le platform_admin et les rôles owner/admin/editor
  // n'ont pas de rôle de tenant "author" ici, donc gardent le menu complet.
  const { role } = useTenant();
  const isAuthorOnly = role === "author";

  const { data: work, isLoading } = useQuery({
    queryKey: ["admin", "works", workId],
    queryFn: () => adminFetch<Work>(`/works/${workId}`),
  });

  const { data: authors } = useQuery({
    queryKey: ["admin", "authors", "options"],
    queryFn: () => adminFetch<Paginated<Option>>("/authors?perPage=100"),
  });

  const { data: categories } = useQuery({
    queryKey: ["admin", "categories", "options"],
    queryFn: () => adminFetch<Paginated<Option>>("/categories?perPage=100"),
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WorkFormValues>({
    resolver: zodResolver(workSchema),
    values: work ? toFormValues(work) : undefined,
  });

  const enFields = useWatch({ control, name: "translations.en" });
  const isEnTranslated = hasAnyValue({
    title: enFields?.title,
    subtitle: enFields?.subtitle,
    shortDescription: enFields?.shortDescription,
    description: enFields?.description,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "works", workId] });

  const updateMutation = useMutation({
    mutationFn: (values: WorkFormValues) =>
      adminFetch<Work>(`/works/${workId}`, {
        method: "PATCH",
        body: {
          authorId: values.authorId,
          categoryId: values.categoryId || undefined,
          status: values.status,
          featured: values.featured,
          translations: buildTranslationsPayload(values),
        },
      }),
    onSuccess: async (updated) => {
      reset(toFormValues(updated));
      toast.success("Œuvre enregistrée.");
      await invalidate();
    },
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return adminFetch<Work>(`/works/${workId}/cover`, { method: "POST", formData });
    },
    onSuccess: async () => {
      toast.success("Couverture mise à jour.");
      await invalidate();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof AdminApiError ? error.message : "Le téléversement a échoué.",
      );
    },
  });

  useEffect(() => {
    // Suit le titre pour l'onglet du navigateur ; pas de logique métier ici.
    if (work?.title && typeof document !== "undefined") {
      document.title = `${work.title} · Administration GeBook`;
    }
  }, [work?.title]);

  if (isLoading || !work) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/oeuvres"
        className="text-muted-foreground hover:text-secondary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Toutes les œuvres
      </Link>

      <AdminPageHeader
        title={work.title}
        description={`/livres/${work.slug}`}
        actions={
          <>
            <Badge variant={workStatusTone(work.status)}>
              {WORK_STATUS_LABELS[work.status]}
            </Badge>
            {work.status === "published" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/livres/${work.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  Voir en ligne
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">
        <AdminPanel title="Couverture">
          <div className="bg-paper-200 ring-ink-900/10 relative aspect-2/3 overflow-hidden rounded-sm ring-1">
            {work.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu d'administration
              <img
                src={resolveAssetUrl(work.coverPath)!}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-ink-300 grid h-full w-full place-items-center text-sm">
                Aucune couverture
              </span>
            )}
          </div>

          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                coverMutation.mutate(file);
              }
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            isLoading={coverMutation.isPending}
            onClick={() => coverInputRef.current?.click()}
          >
            {!coverMutation.isPending && <ImagePlus aria-hidden />}
            {work.coverPath ? "Remplacer" : "Ajouter"}
          </Button>

          {coverMutation.isError && (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {coverMutation.error instanceof AdminApiError
                ? coverMutation.error.message
                : "Le téléversement a échoué."}
            </p>
          )}
        </AdminPanel>

        <AdminPanel title="Informations">
          <form
            onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
            className="space-y-5"
          >
            <FormError
              message={
                updateMutation.isError
                  ? updateMutation.error instanceof AdminApiError
                    ? updateMutation.error.message
                    : "Une erreur est survenue."
                  : undefined
              }
            />

            <div className="grid gap-5 md:grid-cols-2">
              <Field
                id="work-author"
                label="Auteur"
                required
                error={errors.authorId?.message}
              >
                <Select {...register("authorId")}>
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
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field
                id="work-status"
                label="Statut de publication"
                hint={
                  isAuthorOnly
                    ? "La publication revient à l’équipe éditoriale : soumettez l’œuvre une fois prête."
                    : "Seules les œuvres publiées apparaissent sur le site."
                }
              >
                <Select {...register("status")}>
                  <option value="draft">Brouillon</option>
                  <option value="submitted">Soumise à la relecture</option>
                  {!isAuthorOnly && (
                    <>
                      <option value="published">Publiée</option>
                      <option value="inactive">Inactive</option>
                      <option value="archived">Archivée</option>
                    </>
                  )}
                </Select>
              </Field>

              <label className="flex cursor-pointer items-start gap-3 self-end pb-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-4 cursor-pointer"
                  {...register("featured")}
                />
                <span>
                  <span className="text-secondary block font-medium">
                    Mettre en avant
                  </span>
                  <span className="type-caption">
                    Affichée dans la sélection de l’accueil.
                  </span>
                </span>
              </label>
            </div>

            <LocaleTabs
              isEnTranslated={isEnTranslated}
              fr={
                <>
                  <Field
                    id="work-title-fr"
                    label="Titre"
                    required
                    error={errors.translations?.fr?.title?.message}
                  >
                    <Input {...register("translations.fr.title")} />
                  </Field>

                  <Field id="work-subtitle-fr" label="Sous-titre" optional>
                    <Input {...register("translations.fr.subtitle")} />
                  </Field>

                  <Field
                    id="work-short-description-fr"
                    label="Accroche"
                    hint="Une ou deux phrases, affichées sous le titre. 500 caractères maximum."
                    optional
                    error={errors.translations?.fr?.shortDescription?.message}
                  >
                    <Textarea
                      rows={2}
                      {...register("translations.fr.shortDescription")}
                    />
                  </Field>

                  <Field
                    id="work-description-fr"
                    label="Présentation complète"
                    hint="Les retours à la ligne sont conservés à l’affichage."
                    optional
                  >
                    <Textarea rows={8} {...register("translations.fr.description")} />
                  </Field>
                </>
              }
              en={
                <>
                  <Field
                    id="work-title-en"
                    label="Title"
                    optional={!isEnTranslated}
                    error={errors.translations?.en?.title?.message}
                  >
                    <Input {...register("translations.en.title")} />
                  </Field>

                  <Field id="work-subtitle-en" label="Subtitle" optional>
                    <Input {...register("translations.en.subtitle")} />
                  </Field>

                  <Field
                    id="work-short-description-en"
                    label="Short description"
                    hint="One or two sentences, shown under the title. 500 characters maximum."
                    optional
                    error={errors.translations?.en?.shortDescription?.message}
                  >
                    <Textarea
                      rows={2}
                      {...register("translations.en.shortDescription")}
                    />
                  </Field>

                  <Field
                    id="work-description-en"
                    label="Full description"
                    hint="Line breaks are preserved on display."
                    optional
                  >
                    <Textarea rows={8} {...register("translations.en.description")} />
                  </Field>
                </>
              }
            />

            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="submit"
                isLoading={isSubmitting || updateMutation.isPending}
                disabled={!isDirty}
              >
                Enregistrer
              </Button>
              {!isDirty && !updateMutation.isPending && (
                <p className="type-caption">Aucune modification à enregistrer.</p>
              )}
            </div>
          </form>
        </AdminPanel>
      </div>

      <FormatManager workId={workId} />
    </div>
  );
}

function toFormValues(work: Work): WorkFormValues {
  const fr = work.translations.find((t) => t.locale === "fr");
  const en = work.translations.find((t) => t.locale === "en");

  return {
    authorId: work.authorId,
    categoryId: work.categoryId ?? "",
    status: work.status,
    featured: work.featured,
    translations: {
      fr: {
        title: fr?.title ?? work.title,
        subtitle: fr?.subtitle ?? "",
        shortDescription: fr?.shortDescription ?? "",
        description: fr?.description ?? "",
      },
      en: {
        title: en?.title ?? "",
        subtitle: en?.subtitle ?? "",
        shortDescription: en?.shortDescription ?? "",
        description: en?.description ?? "",
      },
    },
  };
}

/**
 * Ne transmet le bloc `en` que s'il contient réellement quelque chose : un
 * bloc vide mais présent créerait une traduction anglaise vide côté API, ce
 * qui casserait le repli vers le français (règle affinée dans
 * `translation-form.ts`).
 */
function buildTranslationsPayload(values: WorkFormValues): {
  fr: {
    title: string;
    subtitle?: string;
    shortDescription?: string;
    description?: string;
  };
  en?: {
    title: string;
    subtitle?: string;
    shortDescription?: string;
    description?: string;
  };
} {
  const fr = values.translations.fr;
  const en = values.translations.en;

  const enHasContent = hasAnyValue({
    title: en.title,
    subtitle: en.subtitle,
    shortDescription: en.shortDescription,
    description: en.description,
  });

  return {
    fr: {
      title: fr.title!.trim(),
      subtitle: emptyToUndefined(fr.subtitle),
      shortDescription: emptyToUndefined(fr.shortDescription),
      description: emptyToUndefined(fr.description),
    },
    ...(enHasContent && {
      en: {
        title: en.title!.trim(),
        subtitle: emptyToUndefined(en.subtitle),
        shortDescription: emptyToUndefined(en.shortDescription),
        description: emptyToUndefined(en.description),
      },
    }),
  };
}
