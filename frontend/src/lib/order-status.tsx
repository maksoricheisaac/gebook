import { Badge } from "@/src/components/ui/badge";
import { orderStatusLabel } from "./order-status-labels";

/*
 * Représentation visuelle d'un statut de commande.
 *
 * Centralisée ici parce que trois écrans l'affichent — mes commandes, la page de
 * règlement et la liste d'administration — et qu'ils utilisaient tous les trois
 * le même badge navy uni. « Payée », « Annulée » et « En attente » se lisaient
 * donc exactement pareil, ce qui vidait le badge de tout sens.
 *
 * La teinte ne porte jamais l'information seule : le libellé est toujours écrit,
 * et le `Badge` d'état ajoute une pastille.
 */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const STATUS_TONES: Record<string, Tone> = {
  pending: "warning",
  awaiting_payment: "warning",
  paid: "success",
  processing: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "neutral",
  refunded: "neutral",
  failed: "danger",
};

export function orderStatusTone(status: string): Tone {
  return STATUS_TONES[status] ?? "neutral";
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={orderStatusTone(status)}>{orderStatusLabel(status)}</Badge>;
}

/** Commandes encore payables : le lien mène alors au règlement, pas au détail. */
export const PAYABLE_STATUSES = ["pending", "awaiting_payment", "failed"];

export function isPayable(status: string): boolean {
  return PAYABLE_STATUSES.includes(status);
}

/**
 * Graphe structurel des transitions, tel que `assertOrderTransitionAllowed()`
 * le voit côté API (`backend/src/modules/orders/order-status.ts`) — mais
 * `paid` et `refunded` n'y sont structurellement valides que sur le papier :
 * `OrdersService.updateStatus()` les refuse tous les deux, systématiquement
 * (Phase 6), parce que ni l'un ni l'autre ne peut se limiter à poser un
 * statut — un paiement doit passer par le webhook (bibliothèque + commissions),
 * un remboursement par `POST /admin/orders/:id/refund` (rend les fonds,
 * révoque l'accès). Gardé comme source unique pour dériver à la fois le menu
 * générique (`allowedTransitions`, qui les exclut) et l'éligibilité au bouton
 * de remboursement dédié (`canRefund`, qui ne regarde que `refunded`).
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "failed", "cancelled"],
  paid: ["processing", "refunded"],
  processing: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  failed: ["awaiting_payment"],
  refunded: [],
};

/** Statuts que `OrdersService.updateStatus()` refuse toujours en tant que cible directe. */
const BLOCKED_DIRECT_TARGETS = new Set(["paid", "refunded"]);

/**
 * Transitions proposées dans le menu générique de l'administration.
 *
 * ⚠️ Reflète `assertOrderTransitionAllowed()`, qui reste **la seule
 * autorité** — cette liste ne fait que masquer les choix voués à l'échec, y
 * compris ceux qui sont structurellement valides mais que l'API bloque quand
 * même en tant que cible directe (voir `BLOCKED_DIRECT_TARGETS`).
 *
 * Si le cycle de vie évolue côté API, cette table doit suivre. Le pire
 * scénario en cas d'oubli reste bénin : une transition valide simplement
 * absente du menu, jamais une transition invalide acceptée.
 */
export function allowedTransitions(status: string): string[] {
  return (ALLOWED_TRANSITIONS[status] ?? []).filter(
    (next) => !BLOCKED_DIRECT_TARGETS.has(next),
  );
}

/** Une commande est remboursable si son statut peut structurellement atteindre `refunded`. */
export function canRefund(status: string): boolean {
  return (ALLOWED_TRANSITIONS[status] ?? []).includes("refunded");
}
