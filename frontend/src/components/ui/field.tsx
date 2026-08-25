import * as React from "react";
import { AlertCircle } from "lucide-react";

import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/lib/utils";

/*
 * Champ de formulaire complet : libellé, aide, saisie, erreur.
 *
 * Il existe pour une raison précise. Avant, chaque formulaire réassemblait à la
 * main un `<Label>`, un `<Input>` et un `<FieldError>`, et le résultat variait :
 * l'aide passait tantôt au-dessus tantôt en dessous, `aria-invalid` n'était posé
 * nulle part, et rien ne reliait le message d'erreur au champ pour un lecteur
 * d'écran.
 *
 * Ici le câblage est fait une fois : `aria-describedby` pointe vers l'aide et
 * l'erreur, `aria-invalid` suit la présence d'une erreur, et le message porte
 * `role="alert"` pour être annoncé dès son apparition.
 *
 * L'enfant reçoit ces attributs par `cloneElement` : la primitive de saisie
 * (`Input`, `Textarea`, `Select`, ou un champ enregistré par react-hook-form)
 * reste libre, seul le câblage d'accessibilité est imposé.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  /** Aide persistante, affichée sous le libellé — pas un placeholder. */
  hint?: React.ReactNode;
  /** Premier message d'erreur du champ, ou rien. */
  error?: string;
  required?: boolean;
  /** Marque explicitement un champ facultatif, quand tous les autres sont requis. */
  optional?: boolean;
  className?: string;
  children: React.ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }>;
}) {
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-secondary text-sm font-semibold">
          {label}
          {required && (
            <span aria-hidden className="text-destructive ml-0.5">
              *
            </span>
          )}
        </Label>
        {optional && <span className="type-caption">facultatif</span>}
      </div>

      {hint && (
        <p id={hintId} className="type-caption -mt-1">
          {hint}
        </p>
      )}

      {React.cloneElement(children, {
        id,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-sm"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Message d'erreur global d'un formulaire (identifiants refusés, API en panne).
 *
 * `role="alert"` le fait annoncer dès qu'il apparaît, sans déplacer le focus —
 * l'utilisateur reste dans le champ où il se trouvait.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="bg-destructive-muted text-destructive flex items-start gap-2 rounded-md px-3.5 py-3 text-sm"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
