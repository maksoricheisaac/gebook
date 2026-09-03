"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AdminPanel } from "@/src/components/admin/admin-page";
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
import { Input } from "@/src/components/ui/input";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";

export function DangerZone() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const EXPECTED_KEYWORD = "SUPPRIMER-TOUT";

  const wipeMutation = useMutation({
    mutationFn: () => adminFetch<void>("/system/wipe", { method: "POST" }),
    onSuccess: async () => {
      setServerError(null);
      setIsFormOpen(false);
      toast.success("Toutes les données ont été supprimées.");
      await queryClient.invalidateQueries();
      window.location.reload();
    },
    onError: (error: unknown) => {
      if (error instanceof AdminApiError) {
        setServerError(error.message);
      } else {
        setServerError("Une erreur inattendue est survenue.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmation !== EXPECTED_KEYWORD) {
      setServerError(`Vous devez taper exactement "${EXPECTED_KEYWORD}" pour confirmer.`);
      return;
    }
    wipeMutation.mutate();
  };

  return (
    <>
      <AdminPanel
        title="Zone de danger (Superadmin)"
        description="Cette section permet d'effectuer des opérations destructrices sur l'ensemble de la plateforme. Ces actions sont irréversibles."
      >
        <div className="border-destructive/20 bg-destructive/5 flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-destructive flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="size-4" />
              Réinitialiser la plateforme
            </h4>
            <p className="text-secondary mt-1 text-sm text-pretty">
              Supprime tous les utilisateurs, espaces, œuvres, et commandes. Seul le
              compte superadmin sera conservé.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmation("");
              setServerError(null);
              setIsFormOpen(true);
            }}
          >
            Supprimer toutes les données
          </Button>
        </div>
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
            <DialogTitle>Êtes-vous absolument sûr ?</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4">
              <p className="text-secondary text-sm">
                Cette action est <strong>irréversible</strong>. Elle supprimera
                définitivement :
              </p>
              <ul className="text-secondary space-y-1 pl-5 text-sm list-disc">
                <li>Tous les espaces d&apos;édition (tenants)</li>
                <li>Toutes les œuvres, auteurs, et catégories</li>
                <li>Tous les historiques de commandes et paiements</li>
                <li>
                  Tous les comptes utilisateurs <em>(sauf le vôtre)</em>
                </li>
              </ul>

              <FormError message={serverError ?? undefined} />

              <Field
                id="wipe-confirmation"
                label={`Veuillez taper "${EXPECTED_KEYWORD}" pour confirmer.`}
                required
              >
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={EXPECTED_KEYWORD}
                  autoComplete="off"
                />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="destructive"
                isLoading={wipeMutation.isPending}
                disabled={confirmation !== EXPECTED_KEYWORD}
              >
                Je comprends les conséquences, tout supprimer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
