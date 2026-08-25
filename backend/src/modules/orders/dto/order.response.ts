import type { Order, OrderItem, User } from '../../../generated/prisma/client';

/**
 * Les montants restent des chaînes décimales à deux décimales, jamais des nombres
 * flottants (règle métier n° 12) — même convention que `catalog.response.ts`.
 */

export interface OrderItemResponse {
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

export interface OrderResponse {
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
  items: OrderItemResponse[];
}

export interface AdminOrderResponse extends OrderResponse {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
}

export function toOrderResponse(
  order: Order & { items: OrderItem[] },
): OrderResponse {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: order.subtotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    discountAmount: order.discountAmount.toFixed(2),
    totalAmount: order.totalAmount.toFixed(2),
    currency: order.currency,
    recipientName: order.recipientName,
    deliveryPhone: order.deliveryPhone,
    deliveryCountry: order.deliveryCountry,
    deliveryCity: order.deliveryCity,
    deliveryDistrict: order.deliveryDistrict,
    deliveryAddress: order.deliveryAddress,
    deliveryLandmark: order.deliveryLandmark,
    paidAt: order.paidAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      workId: item.workId,
      workFormatId: item.workFormatId,
      authorId: item.authorId,
      workTitle: item.workTitle,
      authorName: item.authorName,
      formatType: item.formatType,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}

export function toAdminOrderResponse(
  order: Order & {
    items: OrderItem[];
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  },
): AdminOrderResponse {
  return { ...toOrderResponse(order), user: order.user };
}
