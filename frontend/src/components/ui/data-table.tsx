import * as React from "react";

import { cn } from "@/src/lib/utils";

/*
 * Coquille de tableau.
 *
 * Les quatre tableaux du produit (mes commandes, commandes admin, œuvres,
 * formats) répétaient les mêmes classes, avec des variantes : en-tête tantôt en
 * capitales tantôt non, cellules à `py-3` ici et `py-4` là, débordement
 * horizontal géré une fois sur deux.
 *
 * Le conteneur porte `overflow-x-auto` et un `tabindex` : sur un écran étroit,
 * un tableau large doit pouvoir défiler AUSSI au clavier, pas seulement au
 * doigt. Sans `tabindex`, la zone défilante est inatteignable sans souris.
 */
export function DataTable({
  caption,
  head,
  children,
  className,
}: {
  /** Résumé du tableau, masqué visuellement mais lu par les lecteurs d'écran. */
  caption: string;
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className={cn(
        "border-border bg-card overflow-x-auto rounded-lg border",
        "focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:outline-none",
        className,
      )}
    >
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-border bg-paper-100/70 border-b">
          <tr className="[&>th]:text-muted-foreground [&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-[0.08em] [&>th]:uppercase">
            {head}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">{children}</tbody>
      </table>
    </div>
  );
}

/** Ligne de tableau, avec le survol discret attendu sur une liste cliquable. */
export function DataRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "hover:bg-paper-100/60 transition-colors duration-[--duration-fast]",
        "[&>td]:px-4 [&>td]:py-4 [&>td]:align-middle",
        className,
      )}
      {...props}
    />
  );
}

/** Ligne pleine largeur, pour un état vide ou un chargement dans le tableau. */
export function DataRowFull({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-muted-foreground px-4 py-10 text-center text-sm"
      >
        {children}
      </td>
    </tr>
  );
}
