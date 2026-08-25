import { cookies } from "next/headers";
import { apiFetch } from "./api";
import type { Payment } from "./payment-shared";
import { SESSION_COOKIE_NAME } from "./session-cookie";

/**
 * Lecture des tentatives de paiement d'une commande, côté serveur — même
 * raisonnement que `orders.ts` : le cookie de session doit être relayé
 * explicitement à l'API à chaque appel.
 */

export {
  isPaymentInFlight,
  PAYMENT_STATUS_LABELS,
  paymentStatusLabel,
  SIMULATION_PROVIDER_CODE,
  type Payment,
} from "./payment-shared";

export async function fetchOrderPayments(orderNumber: string): Promise<Payment[]> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  return apiFetch<Payment[]>(`/orders/${encodeURIComponent(orderNumber)}/payments`, {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    revalidate: 0,
  });
}
