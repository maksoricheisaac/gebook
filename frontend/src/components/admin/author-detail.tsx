"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, BookText, ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader, AdminPanel } from "@/src/components/admin/admin-page";
import { LocaleTabs } from "@/src/components/admin/locale-tabs";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { RichTextEditor } from "@/src/components/ui/rich-text-editor";
import { Skeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { resolveAssetUrl } from "@/src/lib/assets";
import { authorInitials } from "@/src/lib/catalog";
import { emptyToUndefined, hasAnyValue } from "@/src/lib/translation-form";
import {
  WORK_STATUS_LABELS,
  workStatusTone,
  type WorkStatus,
} from "@/src/lib/work-status";

interface AuthorTranslation {
  locale: "fr" | "en";
  biography: string | null;
  shortBiography: string | null;
}

type AuthorStatus = "draft" | "active" | "inactive";

interface Author {
  id: string;
  penName: string;
  slug: string;
  photoPath: string | null;
  country: string | null;
  city: string | null;
  status: AuthorStatus;
  payoutMethod: string | null;
  payoutPhone: string | null;
  translations: AuthorTranslation[];
  _count: { works: number };
}

interface AuthorWork {
  id: string;
  title: string;
  slug: string;
  status: WorkStatus;
}

interface Paginated<T> {
  data: T[];
}

const STATUS_LABELS: Record<AuthorStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  inactive: "Inactif",
};

const STATUS_TONES: Record<AuthorStatus, "warning" | "success" | "neutral"> = {
  draft: "warning",
  active: "success",
  inactive: "neutral",
};

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
  payoutMethod: z.string().trim().max(100).optional(),
  payoutPhone: z.string().trim().max(30).optional(),
  status: z.enum(["draft", "active", "inactive"]),
  translations: z.object({
    fr: authorTranslationFieldsSchema,
    en: authorTranslationFieldsSchema,
  }),
});

type AuthorFormValues = z.infer<typeof authorSchema>;

/** Voir le commentaire équivalent dans `work-editor.tsx`. */
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

function toFormValues(author: Author): AuthorFormValues {
  const fr = author.translations.find((t) => t.locale === "fr");
  const en = author.translations.find((t) => t.locale === "en");
  return {
    penName: author.penName,
    slug: author.slug,
    country: author.country ?? "",
    city: author.city ?? "",
    payoutMethod: author.payoutMethod ?? "",
    payoutPhone: author.payoutPhone ?? "",
    status: author.status,
    translations: {
      fr: {
        shortBiography: fr?.shortBiography ?? "",
        biography: fr?.biography ?? "",
      },
      en: {
        shortBiography: en?.shortBiography ?? "",
        biography: en?.biography ?? "",
      },
    },
  };
}

/**
 * Fiche détaillée d'un auteur (brief admin), même schéma que `WorkEditor` :
 * la modale de `author-manager.tsx` ne sert plus qu'à la création rapide,
 * l'édition complète — et la liste des œuvres de l'auteur, qu'aucune modale
 * n'a la place d'afficher — vit ici.
 */
export function AuthorDetail({ authorId }: { authorId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: author, isLoading } = useQuery({
    queryKey: ["admin", "authors", authorId],
    queryFn: () => adminFetch<Author>(`/authors/${authorId}`),
  });

  const { data: works } = useQuery({
    queryKey: ["admin", "works", "by-author", authorId],
    queryFn: () =>
      adminFetch<Paginated<AuthorWork>>(`/works?authorId=${authorId}&perPage=100`),
    enabled: Boolean(author),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AuthorFormValues>({
    resolver: zodResolver(authorSchema),
    values: author ? toFormValues(author) : undefined,
  });

  const enFields = useWatch({ control, name: "translations.en" });
  const isEnTranslated = hasAnyValue({
    shortBiography: enFields?.shortBiography,
    biography: enFields?.biography,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "authors", authorId] });

  const updateMutation = useMutation({
    mutationFn: (values: AuthorFormValues) =>
      adminFetch<Author>(`/authors/${authorId}`, {
        method: "PATCH",
        body: {
          penName: values.penName,
          slug: values.slug,
          country: values.country,
          city: values.city,
          payoutMethod: values.payoutMethod,
          payoutPhone: values.payoutPhone,
          status: values.status,
          translations: buildTranslationsPayload(values),
        },
      }),
    onSuccess: async (updated) => {
      reset(toFormValues(updated));
      toast.success("Auteur enregistré.");
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["admin", "authors"] });
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return adminFetch<Author>(`/authors/${authorId}/photo`, {
        method: "POST",
        formData,
      });
    },
    onSuccess: async () => {
      toast.success("Photo mise à jour.");
      await invalidate();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof AdminApiError ? error.message : "Le téléversement a échoué.",
      );
    },
  });

  if (isLoading || !author) {
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
        href="/admin/auteurs"
        className="text-muted-foreground hover:text-secondary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Tous les auteurs
      </Link>

      <AdminPageHeader
        title={author.penName}
        description={`/auteurs/${author.slug}`}
        actions={
          <Badge variant={STATUS_TONES[author.status]}>
            {STATUS_LABELS[author.status]}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">
        <AdminPanel title="Photo">
          <div className="bg-paper-200 ring-ink-900/10 relative aspect-square overflow-hidden rounded-full ring-1">
            {author.photoPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu d'administration
              <img
                src={resolveAssetUrl(author.photoPath)!}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-ink-600 font-heading grid h-full w-full place-items-center text-2xl">
                {authorInitials(author.penName)}
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                photoMutation.mutate(file);
              }
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            isLoading={photoMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {!photoMutation.isPending && <ImagePlus aria-hidden />}
            {author.photoPath ? "Remplacer" : "Ajouter"}
          </Button>
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

              <Field
                id="author-payout-method"
                label="Moyen de reversement"
                optional
                hint="Ex. « Mobile Money », « Virement bancaire »."
              >
                <Input {...register("payoutMethod")} />
              </Field>

              <Field
                id="author-payout-phone"
                label="Téléphone / compte de reversement"
                optional
              >
                <Input {...register("payoutPhone")} />
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
                    <Textarea rows={2} {...register("translations.fr.shortBiography")} />
                  </Field>

                  <Controller
                    control={control}
                    name="translations.fr.biography"
                    render={({ field }) => (
                      <Field
                        id="author-bio-fr"
                        label="Biographie complète"
                        hint="Affichée sur la fiche de l’auteur."
                        optional
                      >
                        <RichTextEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Le parcours de l’auteur…"
                        />
                      </Field>
                    )}
                  />
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
                    <Textarea rows={2} {...register("translations.en.shortBiography")} />
                  </Field>

                  <Controller
                    control={control}
                    name="translations.en.biography"
                    render={({ field }) => (
                      <Field
                        id="author-bio-en"
                        label="Full biography"
                        hint="Shown on the author's page."
                        optional
                      >
                        <RichTextEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="The author's background…"
                        />
                      </Field>
                    )}
                  />
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

      <AdminPanel
        title="Œuvres de cet auteur"
        description={`${author._count.works} œuvre${author._count.works > 1 ? "s" : ""}.`}
      >
        <DataTable
          caption={`Œuvres de ${author.penName}`}
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
          {!works || works.data.length === 0 ? (
            <DataRowFull colSpan={3}>Aucune œuvre pour le moment.</DataRowFull>
          ) : (
            works.data.map((work) => (
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
