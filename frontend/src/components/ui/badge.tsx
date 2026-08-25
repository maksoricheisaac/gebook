import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/src/lib/utils";

/*
 * Badge GeBook.
 *
 * Deux familles, et il faut choisir la bonne :
 *   - `tag` : une étiquette de catalogue (format, catégorie). Discrète, en
 *     capitales, elle qualifie sans attirer l'œil ;
 *   - les variantes d'état (`success`, `warning`, `danger`, `info`, `neutral`) :
 *     un statut. Elles portent une pastille colorée en plus de la teinte, parce
 *     que la couleur seule ne doit jamais porter l'information.
 *
 * L'ancienne version affichait les formats en aplat navy plein, ce qui donnait
 * plus de poids visuel au mot « PDF » qu'au titre du livre.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        tag: "text-muted-foreground border-border rounded-sm border bg-transparent px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
        solid:
          "bg-secondary text-secondary-foreground rounded-sm px-2 py-0.5 text-xs font-semibold",
        accent:
          "bg-accent-muted text-accent-strong rounded-sm px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
        neutral:
          "bg-muted text-muted-foreground rounded-full py-1 pr-2.5 pl-2 text-xs font-medium",
        info: "bg-ink-700/8 text-ink-700 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium",
        success:
          "bg-success-muted text-success rounded-full py-1 pr-2.5 pl-2 text-xs font-medium",
        warning:
          "bg-warning-muted text-warning rounded-full py-1 pr-2.5 pl-2 text-xs font-medium",
        danger:
          "bg-destructive-muted text-destructive rounded-full py-1 pr-2.5 pl-2 text-xs font-medium",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

/** Variantes qui décrivent un état et portent donc une pastille. */
const DOTTED = new Set(["neutral", "info", "success", "warning", "danger"]);

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {DOTTED.has(variant ?? "") && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
