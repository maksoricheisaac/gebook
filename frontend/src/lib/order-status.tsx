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
 * Transitions proposées dans l'administration.
 *
 * ⚠️ Cette table reflète `assertOrderTransitionAllowed()` côté API
 * (`backend/src/modules/orders/order-status.ts`), qui reste **la seule
 * autorité** : toute transition refusée par le serveur est affichée telle
 * quelle à l'administrateur, et cette liste ne fait que masquer les choix voués
 * à l'échec.
 *
 * Sans elle, la liste déroulante proposait les neuf statuts sur chaque ligne.
 * Faire passer une commande « En attente » directement à « Payée » renvoyait
 * systématiquement « Impossible de faire passer une commande de pending à
 * paid » — l'administrateur découvrait la règle métier par l'erreur, à chaque
 * tentative.
 *
 * Si le cycle de vie évolue côté API, cette table doit suivre. Le pire scénario
 * en cas d'oubli reste bénin : une transition valide simplement absente du
 * menu, jamais une transition invalide acceptée.
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

export function allowedTransitions(status: string): string[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}
