"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/src/components/ui/button";

/**
 * Confirmation d'une action irréversible.
 *
 * Elle remplace `window.confirm()`, utilisé jusqu'ici pour les suppressions. Ce
 * n'est pas qu'une question d'apparence : la boîte native ne permet pas de
 * nommer l'action de confirmation (« OK » ne dit pas ce qui va se passer),
 * n'affiche aucun état d'attente pendant la requête, et son style échappe
 * totalement au produit.
 *
 * Construite sur `<dialog>` natif : la mise au premier plan, le voile, le piège
 * du focus et la fermeture par Échap sont assurés par le navigateur, sans
 * dépendance ni gestionnaire de focus maison.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  isPending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      // Échap déclenche `cancel` : la fermeture doit repasser par l'état React,
      // sinon le composant croit la boîte encore ouverte.
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      className="bg-card shadow-overlay m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-ink-900/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="bg-destructive-muted text-destructive grid size-10 shrink-0 place-items-center rounded-full"
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="type-h3 text-secondary">{title}</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} isLoading={isPending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
