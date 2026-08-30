"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  CART_STORAGE_KEY,
  MAX_LINE_QUANTITY,
  cartItemCount,
  readCartFromStorage,
  writeCartToStorage,
  type CartLine,
} from "@/src/lib/cart-shared";

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  /**
   * Faux tant que `localStorage` n'a pas été lu (premier rendu, serveur et
   * client avant montage). Sans lui, un panier réellement rempli s'afficherait
   * un instant comme vide à chaque rechargement — `lines` vaut `[]` jusqu'à ce
   * que l'effet de lecture s'exécute. Les pages qui distinguent « vide » de
   * « en cours de lecture » (ex. `/panier`) doivent l'utiliser plutôt que de
   * décider sur `lines.length === 0` seul.
   */
  isHydrated: boolean;
  /** Fusionne avec la ligne existante (même format) en additionnant la quantité, sinon ajoute une nouvelle ligne. */
  addItem: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  removeItem: (workFormatId: string) => void;
  setQuantity: (workFormatId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Panier de courses (mission — Tâche 4), volontairement client-only
 * (`localStorage`), pas un modèle Prisma : voir `cart-shared.ts` pour le
 * raisonnement. Monté une seule fois dans `(site)/layout.tsx`, donc partagé
 * entre le catalogue public, la fiche œuvre et `/panier`.
 *
 * Comme `AdminShell` pour sa préférence de repli de barre latérale : le
 * premier rendu (serveur ET client, avant hydratation) est toujours un
 * panier vide — `localStorage` n'existe pas côté serveur — puis se corrige
 * une fois monté. Pas de flash trompeur : la page qui affiche le badge du
 * panier ne dépend jamais du panier pour son rendu initial significatif.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(readCartFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCartToStorage(lines);
  }, [lines, hydrated]);

  // Un autre onglet a modifié le panier : `storage` ne se déclenche que sur
  // les AUTRES onglets, jamais celui qui a écrit — pas de boucle.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === CART_STORAGE_KEY) {
        setLines(readCartFromStorage());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem: CartContextValue["addItem"] = (line, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((l) => l.workFormatId === line.workFormatId);
      if (existing) {
        return current.map((l) =>
          l.workFormatId === line.workFormatId
            ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + quantity) }
            : l,
        );
      }
      return [...current, { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }];
    });
  };

  const removeItem = (workFormatId: string): void => {
    setLines((current) => current.filter((l) => l.workFormatId !== workFormatId));
  };

  const setQuantity = (workFormatId: string, quantity: number): void => {
    if (quantity < 1) {
      removeItem(workFormatId);
      return;
    }
    setLines((current) =>
      current.map((l) =>
        l.workFormatId === workFormatId
          ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
          : l,
      ),
    );
  };

  const clear = (): void => setLines([]);

  const value: CartContextValue = {
    lines,
    itemCount: cartItemCount(lines),
    isHydrated: hydrated,
    addItem,
    removeItem,
    setQuantity,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart() doit être appelé sous <CartProvider>.");
  }
  return context;
}
