/**
 * Types et fonctions pures du panier, partagés entre le contexte client
 * (`cart-provider.tsx`) et tout composant qui a besoin de la forme d'une
 * ligne sans dépendre du contexte lui-même.
 *
 * Le panier est volontairement **client uniquement** (`localStorage`), pas un
 * modèle Prisma : il ne stocke que `workFormatId`/`quantity` (ce que
 * `POST /orders` accepte déjà, y compris plusieurs tenants dans la même
 * commande — `OrdersService.create()`) plus des champs d'affichage, jamais un
 * prix qui ferait autorité. Le backend revalide systématiquement prix et
 * disponibilité depuis la base à la création de la commande (règle n° 12 :
 * jamais confiance dans un prix envoyé par le client).
 */

export interface CartLine {
  workFormatId: string;
  quantity: number;
  /** Champs d'affichage uniquement — jamais transmis au checkout comme preuve de prix. */
  workSlug: string;
  workTitle: string;
  authorName: string;
  coverPath: string | null;
  formatType: string;
  formatLabel: string | null;
  deliveryType: string;
  /** Chaîne décimale, telle que renvoyée par l'API au moment de l'ajout — un aperçu, pas une garantie. */
  price: string;
  tenantSlug: string;
  tenantName: string;
}

export const CART_STORAGE_KEY = "gebook_cart_v1";
export const MAX_LINE_QUANTITY = 50;

export function readCartFromStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function writeCartToStorage(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Stockage indisponible (navigation privée, quota) : le panier reste en
    // mémoire pour la session en cours, simplement pas persisté.
  }
}

function isCartLine(value: unknown): value is CartLine {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CartLine).workFormatId === "string" &&
    typeof (value as CartLine).quantity === "number"
  );
}

/** Regroupe les lignes par tenant vendeur, dans l'ordre de première apparition — reflet direct de l'exemple du brief (« Mampouya Éditions… Kongo Books… »). */
export function groupByTenant(
  lines: CartLine[],
): { tenantSlug: string; tenantName: string; lines: CartLine[] }[] {
  const order: string[] = [];
  const groups = new Map<
    string,
    { tenantSlug: string; tenantName: string; lines: CartLine[] }
  >();

  for (const line of lines) {
    if (!groups.has(line.tenantSlug)) {
      groups.set(line.tenantSlug, {
        tenantSlug: line.tenantSlug,
        tenantName: line.tenantName,
        lines: [],
      });
      order.push(line.tenantSlug);
    }
    groups.get(line.tenantSlug)!.lines.push(line);
  }

  return order.map((slug) => groups.get(slug)!);
}

/**
 * Total d'aperçu, en FCFA (sans décimales, comme `formatPrice`). Sommation en
 * entiers plutôt qu'en `Decimal` (pas de dépendance ajoutée pour un simple
 * aperçu côté client) — jamais envoyée au backend, qui recalcule tout depuis
 * la base au moment de la commande.
 */
export function cartLineSubtotal(line: CartLine): number {
  return Math.round(Number(line.price) * line.quantity);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + cartLineSubtotal(line), 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
