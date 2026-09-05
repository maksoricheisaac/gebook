"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Crown, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { ConfirmDialog } from "@/src/components/admin/confirm-dialog";
import { IdCell } from "@/src/components/admin/id-cell";
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

interface TeamMember {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: string;
  status: string;
  memberSince: string;
}

const ROLES = [
  "owner",
  "admin",
  "editor",
  "author",
  "marketing",
  "finance",
  "viewer",
] as const;

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  editor: "Éditeur",
  author: "Auteur",
  marketing: "Marketing",
  finance: "Finance",
  viewer: "Observateur",
};

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "L'adresse e-mail est obligatoire.")
    .email("Saisissez une adresse e-mail valide."),
  role: z.enum(ROLES),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

const EMPTY: InviteFormValues = { email: "", role: "viewer" };

const EMPTY_MEMBERS: TeamMember[] = [];

/**
 * Gestion de l'équipe de l'espace actif (`/admin/team`, brief §7).
 *
 * Le rôle de chaque ligne se change directement dans le tableau (un
 * `<select>` par membre) plutôt que par une page d'édition séparée — il n'y a
 * qu'un seul champ à modifier, un `select` par ligne reste plus rapide qu'une
 * modale pour ce geste précis. Seule l'invitation, qui est une vraie création
 * avec validation, vit dans une modale. L'API reste seule juge de qui peut
 * faire quoi (propriétaire, dernier propriétaire…) : toute réponse 403/409
 * s'affiche telle quelle.
 */
export function TeamManager() {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [toRemove, setToRemove] = useState<TeamMember | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "team"],
    queryFn: () => adminFetch<TeamMember[]>("/team"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: EMPTY,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "team"] });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteFormValues) =>
      adminFetch<TeamMember>("/team", { method: "POST", body: values }),
    onSuccess: async (member) => {
      reset(EMPTY);
      setServerError(null);
      setIsInviteOpen(false);
      toast.success(`${member.firstName} a rejoint l'équipe.`);
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminFetch<TeamMember>(`/team/${id}`, { method: "PATCH", body: { role } }),
    onSuccess: async (member) => {
      toast.success(
        `Rôle de ${member.firstName} mis à jour : ${ROLE_LABELS[member.role]}.`,
      );
      await invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminFetch<void>(`/team/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      const name = toRemove?.firstName;
      setToRemove(null);
      toast.success(name ? `${name} a été retiré de l'équipe.` : "Membre retiré.");
      await invalidate();
    },
    onError: (error: unknown) => {
      setToRemove(null);
      toast.error(errorMessage(error));
    },
  });

  const members = data ?? EMPTY_MEMBERS;
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const adminCount = members.filter((member) => member.role === "admin").length;

  return (
    <div className="space-y-6">
      <AdminStatGrid columns={3}>
        <AdminStatCard label="Membres" value={members.length} icon={Users} />
        <AdminStatCard label="Propriétaires" value={ownerCount} icon={Crown} />
        <AdminStatCard label="Administrateurs" value={adminCount} icon={Shield} />
      </AdminStatGrid>

      <AdminTablePanel
        title="Équipe"
        description={data ? `${data.length} au total.` : undefined}
        actions={
          <Button type="button" size="sm" onClick={() => setIsInviteOpen(true)}>
            <UserPlus aria-hidden />
            Inviter
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : isError ? (
          <RetryRow onRetry={() => void refetch()} label="l'équipe" />
        ) : (
          <DataTable
            caption="Membres de l'espace actif"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">#</th>
                <th scope="col">Membre</th>
                <th scope="col">Rôle</th>
                <th scope="col">Membre depuis</th>
                <th scope="col" className="text-right!">
                  Actions
                </th>
              </>
            }
          >
            {members.length === 0 ? (
              <DataRowFull colSpan={5}>Aucun membre pour le moment.</DataRowFull>
            ) : (
              members.map((member) => (
                <DataRow key={member.id}>
                  <td>
                    <IdCell id={member.id} />
                  </td>
                  <td>
                    <span className="text-secondary flex items-center gap-2 font-medium">
                      {member.firstName} {member.lastName ?? ""}
                      {member.status === "invited" && (
                        <span className="bg-accent-muted text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                          En attente d&apos;acceptation
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      {member.email}
                    </span>
                  </td>
                  <td>
                    <Select
                      value={member.role}
                      disabled={updateRoleMutation.isPending}
                      onChange={(event) =>
                        updateRoleMutation.mutate({
                          id: member.id,
                          role: event.target.value,
                        })
                      }
                      className="w-auto"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(member.memberSince).toLocaleDateString("fr-FR")}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive-muted"
                        onClick={() => setToRemove(member)}
                      >
                        <Trash2 aria-hidden />
                        <span className="sr-only">
                          Retirer {member.firstName} {member.lastName ?? ""}
                        </span>
                      </Button>
                    </div>
                  </td>
                </DataRow>
              ))
            )}
          </DataTable>
        )}
      </AdminTablePanel>

      <Dialog
        open={isInviteOpen}
        onOpenChange={(open) => {
          setIsInviteOpen(open);
          if (!open) {
            setServerError(null);
            reset(EMPTY);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => inviteMutation.mutate(values))}>
            <DialogBody className="space-y-5">
              <FormError message={serverError ?? undefined} />
              <p className="text-muted-foreground text-sm">
                {
                  "La personne doit déjà avoir un compte GeBook (lecteur) pour rejoindre l'équipe."
                }
              </p>

              <Field
                id="team-invite-email"
                label="Adresse e-mail"
                required
                error={errors.email?.message}
              >
                <Input type="email" autoComplete="email" {...register("email")} />
              </Field>

              <Field id="team-invite-role" label="Rôle" required>
                <Select {...register("role")}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsInviteOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" isLoading={isSubmitting || inviteMutation.isPending}>
                <UserPlus aria-hidden />
                Inviter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toRemove !== null}
        title="Retirer ce membre ?"
        description={
          toRemove
            ? `${toRemove.firstName} ${toRemove.lastName ?? ""} perdra immédiatement l'accès à cet espace.`
            : ""
        }
        confirmLabel="Retirer"
        isPending={removeMutation.isPending}
        onCancel={() => setToRemove(null)}
        onConfirm={() => toRemove && removeMutation.mutate(toRemove.id)}
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
