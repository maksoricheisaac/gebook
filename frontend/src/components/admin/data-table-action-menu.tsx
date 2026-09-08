"use client";

import Link from "next/link";
import { MoreVertical, type LucideIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { cn } from "@/src/lib/utils";

export interface DataTableAction {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Rendu comme un vrai lien (`asChild`), pour une navigation plutôt qu'un clic JS. */
  href?: string;
  disabled?: boolean;
  /** Omise du rendu — ex. « Définir par défaut » sur l'élément déjà par défaut. */
  hidden?: boolean;
  destructive?: boolean;
}

export type DataTableActionEntry =
  DataTableAction | { type: "separator" } | { type: "label"; label: string };

/**
 * Colonne « Actions » compacte des datatables admin : un seul bouton « ⋮ »
 * par ligne, ouvrant un menu contenant les actions déjà existantes de la
 * ressource. Composant unique réutilisé par toutes les pages admin plutôt que
 * réimplémenté à chaque fois.
 *
 * Différer `onSelect` d'un tick (et neutraliser `onCloseAutoFocus`) évite un
 * conflit de focus connu de Radix quand un item ouvre un `Dialog`/
 * `ConfirmDialog` juste après la fermeture du menu — traité une fois ici,
 * plutôt que dans chacun des appelants.
 */
export function DataTableActionMenu({
  actions,
  triggerLabel = "Actions",
}: {
  actions: DataTableActionEntry[];
  triggerLabel?: string;
}) {
  const visible = actions.filter((entry) => !("hidden" in entry) || !entry.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={triggerLabel}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
        {visible.map((entry, index) => {
          if ("type" in entry && entry.type === "separator") {
            return <DropdownMenuSeparator key={index} />;
          }
          if ("type" in entry && entry.type === "label") {
            return <DropdownMenuLabel key={index}>{entry.label}</DropdownMenuLabel>;
          }

          const action = entry as DataTableAction;
          const Icon = action.icon;
          const content = (
            <>
              {Icon && <Icon aria-hidden />}
              {action.label}
            </>
          );
          const variant = action.destructive ? "destructive" : "default";

          if (action.href) {
            return (
              <DropdownMenuItem
                key={action.label}
                asChild
                variant={variant}
                disabled={action.disabled}
              >
                <Link
                  href={action.href}
                  className={cn(action.disabled && "pointer-events-none")}
                >
                  {content}
                </Link>
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={action.label}
              variant={variant}
              disabled={action.disabled}
              onSelect={(event) => {
                event.preventDefault();
                const handler = action.onSelect;
                if (handler) window.setTimeout(handler, 0);
              }}
            >
              {content}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
