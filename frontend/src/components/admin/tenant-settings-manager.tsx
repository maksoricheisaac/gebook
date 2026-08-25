"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Globe, ImagePlus, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { AdminPanel, AdminStatCard, AdminStatGrid } from "@/src/components/admin/admin-page";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Textarea } from "@/src/components/ui/input";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { resolveAssetUrl } from "@/src/lib/assets";
import { emptyToUndefined } from "@/src/lib/translation-form";

interface TenantProfile {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoPath: string | null;
  coverPath: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
  status: string;
}

const urlOrEmpty = (message: string) =>
  z.union([z.literal(""), z.string().trim().url(message)]);

const tenantSettingsSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(150),
  description: z.string().trim().max(2000).optional(),
  website: urlOrEmpty("Adresse du site invalide."),
  socialLinks: z.object({
    facebook: urlOrEmpty("Lien Facebook invalide."),
    instagram: urlOrEmpty("Lien Instagram invalide."),
    x: urlOrEmpty("Lien X (Twitter) invalide."),
    youtube: urlOrEmpty("Lien YouTube invalide."),
  }),
});

type TenantSettingsFormValues = z.infer<typeof tenantSettingsSchema>;

function toFormValues(profile: TenantProfile): TenantSettingsFormValues {
  return {
    name: profile.name,
    description: profile.description ?? "",
    website: profile.website ?? "",
    socialLinks: {
      facebook: profile.socialLinks?.facebook ?? "",
      instagram: profile.socialLinks?.instagram ?? "",
      x: profile.socialLinks?.x ?? "",
      youtube: profile.socialLinks?.youtube ?? "",
    },
  };
}

/**
 * Paramètres et image de marque de l'espace actif (brief §7).
 *
 * Contrairement aux autres modules (catégories, auteurs…), il n'y a ici
 * qu'un seul enregistrement à éditer, jamais de liste : la modale sert donc
 * uniquement aux champs de texte (nom, description, site, réseaux), pas à
 * « créer »/« modifier une ligne parmi d'autres ». Le logo et la couverture
 * restent des contrôles toujours visibles hors modale — comme la photo dans
 * `author-manager.tsx`, un clic déclenche l'envoi immédiat, sans étape
 * « Enregistrer » séparée puisque l'API les persiste indépendamment du reste
 * du profil. Pas de filtre non plus : rien à filtrer sur un seul enregistrement.
 */
export function TenantSettingsManager() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "tenant-settings"],
    queryFn: () => adminFetch<TenantProfile>("/tenant"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TenantSettingsFormValues>({
    resolver: zodResolver(tenantSettingsSchema),
    defaultValues: profile
      ? toFormValues(profile)
      : {
          name: "",
          description: "",
          website: "",
          socialLinks: { facebook: "", instagram: "", x: "", youtube: "" },
        },
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "tenant-settings"] });

  const updateMutation = useMutation({
    mutationFn: (values: TenantSettingsFormValues) =>
      adminFetch<TenantProfile>("/tenant", {
        method: "PATCH",
        body: {
          name: values.name,
          description: emptyToUndefined(values.description),
          website: emptyToUndefined(values.website),
          socialLinks: {
            facebook: emptyToUndefined(values.socialLinks.facebook),
            instagram: emptyToUndefined(values.socialLinks.instagram),
            x: emptyToUndefined(values.socialLinks.x),
            youtube: emptyToUndefined(values.socialLinks.youtube),
          },
        },
      }),
    onSuccess: async () => {
      setServerError(null);
      setIsFormOpen(false);
      toast.success("Paramètres enregistrés.");
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return adminFetch<TenantProfile>("/tenant/logo", { method: "POST", formData });
    },
    onSuccess: async () => {
      toast.success("Logo mis à jour.");
      await invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return adminFetch<TenantProfile>("/tenant/cover", { method: "POST", formData });
    },
    onSuccess: async () => {
      toast.success("Image de couverture mise à jour.");
      await invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const startEdit = (): void => {
    if (!profile) return;
    setServerError(null);
    reset(toFormValues(profile));
    setIsFormOpen(true);
  };

  const socialCount = profile
    ? Object.values(profile.socialLinks ?? {}).filter((value) => value?.trim()).length
    : 0;

  if (isLoading) {
    return (
      <AdminPanel>
        <p className="text-muted-foreground text-sm">Chargement…</p>
      </AdminPanel>
    );
  }

  if (isError || !profile) {
    // Le cas le plus courant ici n'est pas une panne réseau mais un
    // platform_admin qui n'a simplement pas sélectionné d'espace actif — le
    // backend le dit explicitement (`AdminApiError.message`), donc autant
    // l'afficher plutôt qu'un message générique qui donne l'impression d'une
    // page cassée ou vide.
    const message =
      error instanceof AdminApiError
        ? error.message
        : "Les paramètres n’ont pas pu être chargés.";
    return (
      <AdminPanel>
        <p className="text-destructive text-sm">
          {message}{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            className="cursor-pointer font-semibold underline"
          >
            Réessayer
          </button>
        </p>
      </AdminPanel>
    );
  }

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard label="Site web" value={profile.website ? "Renseigné" : "Absent"} icon={Globe} />
        <AdminStatCard label="Réseaux sociaux" value={socialCount} />
        <AdminStatCard label="Logo" value={profile.logoPath ? "Oui" : "Non"} />
        <AdminStatCard label="Couverture" value={profile.coverPath ? "Oui" : "Non"} />
      </AdminStatGrid>

      <AdminPanel title="Images de marque" description="Utilisées sur la fiche publique de l’espace.">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex items-center gap-4">
            {profile.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu d'administration, pas d'optimisation nécessaire
              <img
                src={resolveAssetUrl(profile.logoPath)!}
                alt=""
                className="ring-border bg-paper-100 size-16 rounded-md object-contain ring-1"
              />
            ) : (
              <span
                aria-hidden
                className="bg-paper-200 text-ink-600 grid size-16 place-items-center rounded-md text-xs"
              >
                Aucun
              </span>
            )}
            <div>
              <p className="text-secondary text-sm font-semibold">Logo</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) logoMutation.mutate(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                isLoading={logoMutation.isPending}
                onClick={() => logoInputRef.current?.click()}
              >
                {!logoMutation.isPending && <ImagePlus aria-hidden />}
                {profile.logoPath ? "Changer le logo" : "Ajouter un logo"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {profile.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu d'administration, pas d'optimisation nécessaire
              <img
                src={resolveAssetUrl(profile.coverPath)!}
                alt=""
                className="ring-border bg-paper-100 h-16 w-28 rounded-md object-cover ring-1"
              />
            ) : (
              <span
                aria-hidden
                className="bg-paper-200 text-ink-600 grid h-16 w-28 place-items-center rounded-md text-xs"
              >
                Aucune
              </span>
            )}
            <div>
              <p className="text-secondary text-sm font-semibold">Couverture</p>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) coverMutation.mutate(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                isLoading={coverMutation.isPending}
                onClick={() => coverInputRef.current?.click()}
              >
                {!coverMutation.isPending && <ImagePlus aria-hidden />}
                {profile.coverPath ? "Changer la couverture" : "Ajouter une couverture"}
              </Button>
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Profil de l’espace"
        description="Visible sur la fiche publique et dans les échanges avec les lecteurs."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil aria-hidden />
            Modifier
          </Button>
        }
      >
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">Nom</dt>
            <dd className="text-secondary mt-1 text-sm font-medium">{profile.name}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Site web</dt>
            <dd className="mt-1 text-sm">
              {profile.website ? (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1.5 hover:underline"
                >
                  <Globe aria-hidden className="size-3.5" />
                  {profile.website}
                </a>
              ) : (
                <span className="text-muted-foreground">Non renseigné</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="type-label text-muted-foreground">Description</dt>
            <dd className="text-secondary mt-1 text-sm text-pretty">
              {profile.description || <span className="text-muted-foreground">Non renseignée</span>}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="type-label text-muted-foreground">Réseaux sociaux</dt>
            <dd className="mt-1.5 flex flex-wrap gap-3">
              {profile.socialLinks?.facebook && (
                <SocialLink href={profile.socialLinks.facebook} label="Facebook" />
              )}
              {profile.socialLinks?.instagram && (
                <SocialLink href={profile.socialLinks.instagram} label="Instagram" />
              )}
              {profile.socialLinks?.x && <SocialLink href={profile.socialLinks.x} label="X" />}
              {profile.socialLinks?.youtube && (
                <SocialLink href={profile.socialLinks.youtube} label="YouTube" />
              )}
              {socialCount === 0 && <span className="text-muted-foreground text-sm">Aucun</span>}
            </dd>
          </div>
        </dl>
      </AdminPanel>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setServerError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le profil de l’espace</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => updateMutation.mutate(values))}>
            <DialogBody className="space-y-5">
              <FormError message={serverError ?? undefined} />

              <Field id="tenant-name" label="Nom" required error={errors.name?.message}>
                <Input {...register("name")} />
              </Field>

              <Field id="tenant-description" label="Description" optional>
                <Textarea rows={3} {...register("description")} />
              </Field>

              <Field id="tenant-website" label="Site web" optional error={errors.website?.message}>
                <Input type="url" placeholder="https://…" {...register("website")} />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="tenant-social-facebook"
                  label="Facebook"
                  optional
                  error={errors.socialLinks?.facebook?.message}
                >
                  <Input type="url" placeholder="https://…" {...register("socialLinks.facebook")} />
                </Field>
                <Field
                  id="tenant-social-instagram"
                  label="Instagram"
                  optional
                  error={errors.socialLinks?.instagram?.message}
                >
                  <Input type="url" placeholder="https://…" {...register("socialLinks.instagram")} />
                </Field>
                <Field
                  id="tenant-social-x"
                  label="X (Twitter)"
                  optional
                  error={errors.socialLinks?.x?.message}
                >
                  <Input type="url" placeholder="https://…" {...register("socialLinks.x")} />
                </Field>
                <Field
                  id="tenant-social-youtube"
                  label="YouTube"
                  optional
                  error={errors.socialLinks?.youtube?.message}
                >
                  <Input type="url" placeholder="https://…" {...register("socialLinks.youtube")} />
                </Field>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" isLoading={isSubmitting || updateMutation.isPending}>
                Enregistrer les modifications
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="border-border text-secondary hover:border-primary/40 hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors"
    >
      <Link2 aria-hidden className="size-3.5" />
      {label}
    </a>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}
