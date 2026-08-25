/**
 * Séparé de `payments.ts` pour la même raison qu'`order-status-labels.ts` est
 * séparé d'`orders.ts` : `payments.ts` importe `next/headers`, que Next.js refuse
 * de voir atteindre un composant client, même transitivement. Ce fichier n'importe
 * rien de tel — le panneau de règlement, composant client, peut donc s'en servir.
 */

/** Code du prestataire de simulation, seul à proposer un règlement simulé. */
export const SIMULATION_PROVIDER_CODE = "fake";

export interface Payment {
  id: string;
  providerCode: string;
  status: string;
  expectedAmount: string;
  paidAmount: string | null;
  currency: string;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  initialized: "Initialisée",
  pending: "En attente de règlement",
  successful: "Réglé",
  failed: "Échoué",
  cancelled: "Annulé",
  refunded: "Remboursé",
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/** Une tentative dans l'un de ces états attend encore une réponse du prestataire. */
export function isPaymentInFlight(payment: Payment): boolean {
  return payment.status === "initialized" || payment.status === "pending";
}
