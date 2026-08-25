import { cookies } from "next/headers";
import { apiFetch } from "./api";
import type { Paginated } from "./catalog";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export { ORDER_STATUS_LABELS, orderStatusLabel } from "./order-status-labels";

/*
 * Lecture des commandes, côté serveur.
 *
 * Même raisonnement que `getCurrentUser()` dans `auth.ts` : un Server Component ne
 * reçoit aucun cookie de navigateur automatiquement, il faut le lire ici et le
 * retransmettre explicitement à l'API à chaque appel.
 */

export interface OrderItem {
  id: string;
  workId: string;
  workFormatId: string;
  authorId: string;
  workTitle: string;
  authorName: string;
  formatType: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  deliveryFee: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  recipientName: string | null;
  deliveryPhone: string | null;
  deliveryCountry: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryAddress: string | null;
  deliveryLandmark: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {};
}

export async function fetchOrder(orderNumber: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(orderNumber)}`, {
    headers: await authHeaders(),
    // Statut et contenu propres à l'utilisateur connecté : jamais mis en cache.
    revalidate: 0,
  });
}

export async function fetchMyOrders(page = 1): Promise<Paginated<Order>> {
  return apiFetch<Paginated<Order>>("/orders/me", {
    query: { page },
    headers: await authHeaders(),
    revalidate: 0,
  });
}
