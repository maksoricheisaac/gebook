import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";

import { cn } from "@/src/lib/utils";

/*
 * Bouton GeBook.
 *
 * Six variantes, quatre tailles, et c'est tout. La version précédente héritait
 * du style `radix-nova` de shadcn : boutons de 32 px de haut, sous les 44 px
 * exigés au tactile, et une variante `destructive` en fond pâle qu'aucun
 * utilisateur ne lisait comme dangereuse.
 *
 * Hiérarchie :
 *   default     l'action principale de l'écran — une seule à la fois ;
 *   secondary   l'action structurante (navy), pour l'administration ;
 *   outline     l'action secondaire ;
 *   ghost       l'action tertiaire, dans une barre d'outils ;
 *   destructive l'action irréversible, en terre cuite pleine ;
 *   link        l'action qui est en réalité une navigation.
 *
 * `isLoading` fait partie de la primitive plutôt que d'être réinventé dans
 * chaque formulaire : le bouton se désactive, garde sa largeur (le libellé reste
 * en place) et annonce l'attente aux lecteurs d'écran via `aria-busy`.
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2",
    "rounded-md border border-transparent text-sm font-semibold whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[--duration-fast] ease-[--ease-out]",
    "outline-none select-none",
    "focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-raised hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-ink-700",
        outline:
          "border-border-strong bg-card text-secondary hover:border-secondary/40 hover:bg-muted",
        ghost: "text-secondary hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary h-auto rounded-sm px-0 underline-offset-4 hover:underline",
      },
      size: {
        /* 40 px : la cible tactile réelle est portée à 44 px par le padding du
           conteneur dans les barres d'outils, où les boutons sont côte à côte. */
        default: "h-10 px-4",
        sm: "h-8 gap-1.5 px-3 text-[0.8125rem]",
        lg: "h-12 px-6 text-[0.9375rem]",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  isLoading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={isLoading || undefined}
      disabled={asChild ? undefined : (disabled ?? isLoading)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {isLoading && !asChild ? (
        <>
          <Loader2 aria-hidden className="animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
