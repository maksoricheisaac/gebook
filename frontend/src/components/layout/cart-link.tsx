"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { useCart } from "@/src/components/providers/cart-provider";

/**
 * Lien panier de l'en-tête public (mission — Tâche 4).
 *
 * Composant client isolé (plutôt que le badge dans `SiteHeader` directement)
 * pour la même raison que `MobileMenu`/`SearchField` : `SiteHeader` reste un
 * composant serveur, seul ce qui a réellement besoin d'état client l'est.
 */
export function CartLink() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/panier"
      aria-label={
        itemCount > 0
          ? `Panier, ${itemCount} article${itemCount > 1 ? "s" : ""}`
          : "Panier"
      }
      className="hover:bg-paper-100 text-secondary relative inline-flex size-10 items-center justify-center rounded-md transition-colors duration-[--duration-fast]"
    >
      <ShoppingCart aria-hidden className="size-5" />
      {itemCount > 0 && (
        <span
          aria-hidden
          className="bg-primary text-primary-foreground tnum absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full px-1 text-[0.6875rem] font-semibold leading-4.5"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </Link>
  );
}
