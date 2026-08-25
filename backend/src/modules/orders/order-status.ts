import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/enums';

/**
 * Transitions autorisées, dans les deux sens du cycle de vie d'une commande :
 * numérique (paiement puis accès immédiat) ou physique (paiement puis livraison).
 * `paid`/`awaiting_payment` seront atteints par le module de paiement (phase 8) ;
 * cette machine à états existe dès maintenant pour qu'aucun code futur n'ait à
 * réinventer les transitions valides.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.pending]: [OrderStatus.awaiting_payment, OrderStatus.cancelled],
  [OrderStatus.awaiting_payment]: [
    OrderStatus.paid,
    OrderStatus.failed,
    OrderStatus.cancelled,
  ],
  [OrderStatus.paid]: [OrderStatus.processing, OrderStatus.refunded],
  [OrderStatus.processing]: [OrderStatus.shipped, OrderStatus.refunded],
  [OrderStatus.shipped]: [OrderStatus.delivered, OrderStatus.refunded],
  [OrderStatus.delivered]: [OrderStatus.refunded],
  [OrderStatus.cancelled]: [],
  [OrderStatus.failed]: [OrderStatus.awaiting_payment],
  [OrderStatus.refunded]: [],
};

export function assertOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `Impossible de faire passer une commande de « ${from} » à « ${to} ».`,
    );
  }
}
