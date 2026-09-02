"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";

import { AdminPanel } from "@/src/components/admin/admin-page";
import { ConfirmDialog } from "@/src/components/admin/confirm-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { deliveryTypeLabel, formatPrice, formatTypeLabel } from "@/src/lib/format";

interface WorkFormat {
  id: string;
  formatType: "pdf" | "paper";
  label: string | null;
  price: string;
  deliveryType: "digital_download" | "physical_delivery" | "pickup";
  isAvailable: boolean;
}

// Ni EPUB ni l'audio ne figurent ici volontairement — « PDF d'abord »
// (décision produit, 2026-09), même restriction que côté API
// (`accepted-format-types.ts`).
const FORMAT_TYPES = [
  { value: "pdf", label: "PDF", deliveryType: "digital_download" },
  { value: "paper", label: "Papier", deliveryType: "physical_delivery" },
] as const;

const ACCEPT_BY_FORMAT: Record<string, string> = {
  pdf: "application/pdf",
};

/**
 * Formats d'une œuvre : prix, disponibilité et fichier.
 *
 * C'est l'écran qui traduit la règle métier centrale du projet. Il gagne ici
 * deux choses qui lui manquaient : la disponibilité est une vraie case à cocher
 * étiquetée — c'était un texte cliquable dont rien n'indiquait qu'il était
 * interactif — et la suppression passe par une confirmation nommée plutôt que
 * par `window.confirm`.
 */
export function FormatManager({ workId }: { workId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WorkFormat | null>(null);
  const [newFormat, setNewFormat] = useState({
    formatType: "pdf" as (typeof FORMAT_TYPES)[number]["value"],
    price: "",
  });
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: formats, isLoading } = useQuery({
    queryKey: ["admin", "works", workId, "formats"],
    queryFn: async () => {
      const work = await adminFetch<{ formats: WorkFormat[] }>(`/works/${workId}`);
      return work.formats;
    },
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "works", workId] });

  const createFormat = useMutation({
    mutationFn: () => {
      const definition = FORMAT_TYPES.find((f) => f.value === newFormat.formatType)!;
      return adminFetch<WorkFormat>(`/works/${workId}/formats`, {
        method: "POST",
        body: {
          formatType: newFormat.formatType,
          price: newFormat.price,
          deliveryType: definition.deliveryType,
        },
      });
    },
    onSuccess: async () => {
      setNewFormat({ formatType: "pdf", price: "" });
      setError(null);
      await invalidate();
    },
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  const deleteFormat = useMutation({
    mutationFn: (formatId: string) =>
      adminFetch<void>(`/works/${workId}/formats/${formatId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setToDelete(null);
      await invalidate();
    },
    onError: (e: unknown) => {
      setToDelete(null);
      setError(errorMessage(e));
    },
  });

  const toggleAvailable = useMutation({
    mutationFn: (format: WorkFormat) =>
      adminFetch<WorkFormat>(`/works/${workId}/formats/${format.id}`, {
        method: "PATCH",
        body: { isAvailable: !format.isAvailable },
      }),
    onSuccess: invalidate,
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  const uploadFile = useMutation({
    mutationFn: ({ formatId, file }: { formatId: string; file: File }) => {
      const formData = new FormData();
      formData.set("file", file);
      return adminFetch(`/works/${workId}/formats/${formatId}/file`, {
        method: "POST",
        formData,
      });
    },
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  return (
    <AdminPanel
      title="Formats et prix"
      description="Une œuvre peut être vendue dans plusieurs formats, chacun avec son prix et son mode de remise."
    >
      <div className="space-y-5">
        <FormError message={error ?? undefined} />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : formats?.length === 0 ? (
          <p className="border-border-strong text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
            Aucun format pour le moment. Cette œuvre ne peut pas être commandée tant
            qu’aucun format n’est ajouté.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-md border">
            {formats?.map((format) => (
              <li
                key={format.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4"
              >
                <div className="min-w-40 flex-1">
                  <p className="text-secondary text-sm font-semibold">
                    {format.label ?? formatTypeLabel(format.formatType)}
                  </p>
                  <p className="type-caption">
                    {format.formatType.toUpperCase()} ·{" "}
                    {deliveryTypeLabel(format.deliveryType)}
                  </p>
                </div>

                <p className="text-secondary tnum w-28 text-sm font-semibold">
                  {formatPrice(format.price)}
                </p>

                {/* Case à cocher étiquetée : l'ancien texte « Disponible »
                    cliquable n'avait aucune affordance et n'était pas
                    atteignable au clavier. */}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={format.isAvailable}
                    disabled={toggleAvailable.isPending}
                    onChange={() => toggleAvailable.mutate(format)}
                    className="accent-primary size-4 cursor-pointer"
                  />
                  <Badge variant={format.isAvailable ? "success" : "neutral"}>
                    {format.isAvailable ? "En vente" : "Retiré"}
                  </Badge>
                </label>

                {format.deliveryType !== "physical_delivery" && (
                  <>
                    <input
                      ref={(el) => {
                        fileInputRefs.current[format.id] = el;
                      }}
                      type="file"
                      accept={ACCEPT_BY_FORMAT[format.formatType]}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          uploadFile.mutate({ formatId: format.id, file });
                        }
                        event.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      // `variables` (pas juste `isPending`) : le fichier scanné
                      // (ClamAV, contenu actif) peut prendre plusieurs secondes —
                      // seul le format réellement en cours d'envoi doit tourner,
                      // pas les autres lignes le temps qu'il termine.
                      isLoading={
                        uploadFile.isPending &&
                        uploadFile.variables?.formatId === format.id
                      }
                      onClick={() => fileInputRefs.current[format.id]?.click()}
                    >
                      {!uploadFile.isPending && <Upload aria-hidden />}
                      Fichier
                      <span className="sr-only">
                        {" "}
                        du format {format.formatType.toUpperCase()}
                      </span>
                    </Button>
                  </>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive-muted ml-auto"
                  onClick={() => setToDelete(format)}
                >
                  <Trash2 aria-hidden />
                  <span className="sr-only">
                    Supprimer le format {format.formatType.toUpperCase()}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createFormat.mutate();
          }}
          className="border-border-strong flex flex-wrap items-end gap-4 rounded-md border border-dashed p-4"
        >
          <Field id="new-format-type" label="Format" className="w-40">
            <Select
              value={newFormat.formatType}
              onChange={(event) =>
                setNewFormat((current) => ({
                  ...current,
                  formatType: event.target.value as typeof current.formatType,
                }))
              }
            >
              {FORMAT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="new-format-price" label="Prix (FCFA)" required className="w-40">
            <Input
              inputMode="decimal"
              placeholder="5000"
              value={newFormat.price}
              onChange={(event) =>
                setNewFormat((current) => ({ ...current, price: event.target.value }))
              }
            />
          </Field>

          <Button type="submit" isLoading={createFormat.isPending}>
            {!createFormat.isPending && <Plus aria-hidden />}
            Ajouter le format
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce format ?"
        description={
          toDelete
            ? `Le format ${toDelete.formatType.toUpperCase()} à ${formatPrice(toDelete.price)} ne sera plus proposé à la vente. Les commandes déjà passées ne sont pas modifiées.`
            : ""
        }
        confirmLabel="Supprimer le format"
        isPending={deleteFormat.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteFormat.mutate(toDelete.id)}
      />
    </AdminPanel>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.message;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}
