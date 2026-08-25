import * as React from "react";

import { cn } from "@/src/lib/utils";

/*
 * Champs de saisie.
 *
 * Hauteur portée à 44 px : c'est la cible tactile minimale, et les champs de
 * 32 px de la version précédente obligeaient à viser. La taille de texte reste à
 * 16 px sur mobile — en dessous, iOS zoome automatiquement à la mise au point et
 * casse la mise en page.
 *
 * L'état d'erreur passe par `aria-invalid`, jamais par une classe : l'attribut
 * qui colore le champ est le même que celui qui l'annonce au lecteur d'écran,
 * donc les deux ne peuvent pas diverger.
 */
const fieldBase = [
  "w-full min-w-0 rounded-md border bg-card text-foreground",
  "border-input placeholder:text-muted-foreground/70",
  "transition-[border-color,box-shadow] duration-[--duration-fast] ease-[--ease-out]",
  "outline-none",
  "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-[3px]",
];

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        "h-11 px-3.5 text-base md:text-sm",
        "file:text-foreground file:mr-3 file:inline-flex file:h-7 file:cursor-pointer file:rounded-sm file:border-0 file:bg-muted file:px-2.5 file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldBase, "min-h-28 px-3.5 py-2.5 text-base md:text-sm", className)}
      {...props}
    />
  );
}

/**
 * Liste déroulante native.
 *
 * Volontairement native et non un composant stylé : elle fonctionne sans
 * JavaScript, se comporte correctement au clavier et ouvre le sélecteur du
 * téléphone sur mobile. Seule l'habillage change — la flèche est dessinée en
 * fond pour remplacer celle du système, qui ignore nos couleurs.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        fieldBase,
        // `select-chevron` (défini dans `globals.css`) dessine la flèche : celle
        // du système ignore nos couleurs, et `appearance-none` la retire.
        "select-chevron h-11 cursor-pointer appearance-none py-0 pr-10 pl-3.5 text-base md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea, Select };
