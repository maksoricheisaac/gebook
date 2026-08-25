/**
 * Séparé de `orders.ts` pour la même raison qu'`auth-shared.ts` est séparé
 * d'`auth.ts` : `orders.ts` importe `next/headers`, que Next.js refuse de voir
 * atteindre un composant client, même transitivement. Ce fichier n'importe rien de
 * tel — la liste des commandes de l'administration, un composant client, peut donc
 * s'en servir sans risque.
 */

/** Libellés des statuts de commande, dans l'ordre du cycle de vie. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  awaiting_payment: "En attente de paiement",
  paid: "Payée",
  processing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
  failed: "Échouée",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
