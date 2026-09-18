"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { fetchPreview, PreviewError } from "@/src/lib/preview";
import { cn } from "@/src/lib/utils";
import { BookReader } from "./book-reader";

/**
 * Point d'entrée réutilisable de la Book Preview Sandbox (brief §3) :
 *
 * ```
 * BookPreview
 *   └── BookReader   (affichage des pages déjà autorisées par le backend)
 * ```
 *
 * `PreviewPolicy` n'existe pas comme composant frontend séparé — c'est
 * délibéré : la politique n'a de sens que calculée côté backend
 * (`PreviewPolicyService`), et `preview.preview` (la réponse de l'API) EST
 * cette politique, telle que le serveur l'a tranchée. La dupliquer ici
 * n'ajouterait qu'un second endroit à faire dériver de la vérité (brief §5).
 *
 * Ne connaît jamais de `mode` choisi par l'appelant : le backend seul décide,
 * à partir de la session, qui voit quoi. Un unique composant, réutilisé
 * partout (catalogue, fiche livre, espace auteur, administration) — jamais
 * un second lecteur.
 */
export function BookPreview({
  slug,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  slug: string;
  /** Omis pour un usage piloté de l'extérieur (`open`/`onOpenChange`) — par
   * exemple depuis un menu d'actions, où le déclencheur n'est pas un simple
   * bouton mais une entrée de menu. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["preview", slug],
    queryFn: () => fetchPreview(slug),
    enabled: open,
    retry: false,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFullscreen(false);
      }}
    >
      {trigger && (
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      )}
      <DialogContent
        size={fullscreen ? "full" : "lg"}
        className={cn("flex flex-col p-0", fullscreen && "sm:!max-w-none")}
      >
        <DialogTitle className="sr-only">Aperçu du livre</DialogTitle>

        {isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10">
            <div className="border-border h-64 w-44 animate-pulse rounded-md border" />
            <p className="text-muted-foreground text-sm">Chargement de l’aperçu…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertCircle aria-hidden className="text-destructive size-8" />
            <p className="text-secondary font-medium">Impossible de charger l’aperçu.</p>
            <p className="text-muted-foreground text-sm">
              {error instanceof PreviewError && error.statusCode === 404
                ? "Cette œuvre n’est pas disponible."
                : "Une erreur est survenue."}
            </p>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {data && (
          <BookReader
            preview={data}
            bookSlug={slug}
            isFullscreen={fullscreen}
            onFullscreen={() => setFullscreen((f) => !f)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
