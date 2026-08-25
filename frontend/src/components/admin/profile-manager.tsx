"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AdminPanel } from "@/src/components/admin/admin-page";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { AccountApiError, accountFetch } from "@/src/lib/account-api";
import type { CurrentUser } from "@/src/lib/auth-shared";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur plateforme",
  reader: "Lecteur",
  author: "Auteur",
};

const profileSchema = z.object({
  firstName: z.string().trim().min(2, "Le prénom doit contenir au moins 2 caractères.").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().min(1, "L'adresse e-mail est obligatoire.").email("Saisissez une adresse e-mail valide."),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est obligatoire."),
    newPassword: z
      .string()
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
        "Au moins 8 caractères, avec une majuscule, une minuscule et un chiffre.",
      ),
    newPasswordConfirmation: z.string().min(1, "Confirmez le nouveau mot de passe."),
  })
  .refine((values) => values.newPassword === values.newPasswordConfirmation, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["newPasswordConfirmation"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

const EMPTY_PASSWORD: PasswordFormValues = {
  currentPassword: "",
  newPassword: "",
  newPasswordConfirmation: "",
};

/**
 * Profil de l'administrateur connecté (brief §8) : ses informations
 * personnelles et son mot de passe, jamais son rôle — `UpdateProfileDto`
 * côté API ne l'accepte de toute façon pas. Deux formulaires directement
 * visibles plutôt que derrière une modale : contrairement aux autres modules,
 * il n'y a ici qu'un seul enregistrement possible (« soi-même »), la logique
 * « créer/modifier une ligne parmi d'autres » qui justifie les modales
 * ailleurs ne s'applique pas.
 */
export function ProfileManager({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName ?? "",
      email: user.email,
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: EMPTY_PASSWORD,
  });

  const profileMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      accountFetch<CurrentUser>("/me", {
        method: "PATCH",
        body: {
          firstName: values.firstName,
          lastName: values.lastName || undefined,
          email: values.email,
        },
      }),
    onSuccess: (updated) => {
      setProfileError(null);
      toast.success("Profil mis à jour.");
      profileForm.reset({
        firstName: updated.firstName,
        lastName: updated.lastName ?? "",
        email: updated.email,
      });
      // La topbar et la barre latérale affichent le prénom depuis le layout
      // serveur (`requireAdminAccess()`) : sans ce rafraîchissement, elles
      // continueraient de montrer l'ancien nom jusqu'à la prochaine
      // navigation complète.
      router.refresh();
    },
    onError: (error: unknown) => setProfileError(errorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      accountFetch<void>("/me/password", { method: "POST", body: values }),
    onSuccess: () => {
      setPasswordError(null);
      toast.success("Mot de passe modifié. Vos autres sessions ont été déconnectées.");
      passwordForm.reset(EMPTY_PASSWORD);
    },
    onError: (error: unknown) => setPasswordError(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <AdminPanel
        title="Informations personnelles"
        description="Votre identité et votre adresse e-mail de connexion."
      >
        <div className="mb-5 flex items-center gap-4">
          <span
            aria-hidden
            className="bg-secondary text-secondary-foreground grid size-14 place-items-center rounded-full text-lg font-semibold"
          >
            {user.firstName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div>
            <p className="text-secondary text-sm font-semibold">
              {user.firstName} {user.lastName ?? ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user.roles.map((role) => (
                <Badge key={role} variant="neutral">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <form
          onSubmit={profileForm.handleSubmit((values) => profileMutation.mutate(values))}
          className="space-y-5"
        >
          <FormError message={profileError ?? undefined} />

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              id="profile-first-name"
              label="Prénom"
              required
              error={profileForm.formState.errors.firstName?.message}
            >
              <Input {...profileForm.register("firstName")} />
            </Field>

            <Field id="profile-last-name" label="Nom" optional>
              <Input {...profileForm.register("lastName")} />
            </Field>
          </div>

          <Field
            id="profile-email"
            label="Adresse e-mail"
            hint="Sert aussi à la connexion."
            required
            error={profileForm.formState.errors.email?.message}
          >
            <Input type="email" autoComplete="email" {...profileForm.register("email")} />
          </Field>

          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={profileForm.formState.isSubmitting || profileMutation.isPending}
            >
              <UserRound aria-hidden />
              Enregistrer les modifications
            </Button>
          </div>
        </form>
      </AdminPanel>

      <AdminPanel
        title="Mot de passe"
        description="Un mot de passe changé déconnecte immédiatement vos autres sessions actives."
      >
        <form
          onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
          className="space-y-5"
        >
          <FormError message={passwordError ?? undefined} />

          <Field
            id="password-current"
            label="Mot de passe actuel"
            required
            error={passwordForm.formState.errors.currentPassword?.message}
          >
            <Input
              type="password"
              autoComplete="current-password"
              {...passwordForm.register("currentPassword")}
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              id="password-new"
              label="Nouveau mot de passe"
              hint="8 caractères minimum, avec majuscule, minuscule et chiffre."
              required
              error={passwordForm.formState.errors.newPassword?.message}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPassword")}
              />
            </Field>

            <Field
              id="password-confirm"
              label="Confirmer le nouveau mot de passe"
              required
              error={passwordForm.formState.errors.newPasswordConfirmation?.message}
            >
              <Input
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPasswordConfirmation")}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={passwordForm.formState.isSubmitting || passwordMutation.isPending}
            >
              <KeyRound aria-hidden />
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </AdminPanel>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <ShieldCheck aria-hidden className="size-3.5" />
        Votre mot de passe n’est jamais visible ni stocké en clair.
      </p>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AccountApiError) {
    return error.message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}
