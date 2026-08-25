import { OrderStatus } from '../../generated/prisma/enums';
import { assertOrderTransitionAllowed } from './order-status';

describe('assertOrderTransitionAllowed', () => {
  it('autorise les transitions prévues par le cycle de vie', () => {
    expect(() =>
      assertOrderTransitionAllowed(
        OrderStatus.pending,
        OrderStatus.awaiting_payment,
      ),
    ).not.toThrow();
    expect(() =>
      assertOrderTransitionAllowed(
        OrderStatus.awaiting_payment,
        OrderStatus.paid,
      ),
    ).not.toThrow();
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.paid, OrderStatus.processing),
    ).not.toThrow();
  });

  it('autorise de rester sur le même statut (opération sans effet)', () => {
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.paid, OrderStatus.paid),
    ).not.toThrow();
  });

  it('refuse de sauter des étapes', () => {
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.pending, OrderStatus.delivered),
    ).toThrow();
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.pending, OrderStatus.paid),
    ).toThrow();
  });

  it('refuse toute sortie d’un statut terminal', () => {
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.cancelled, OrderStatus.pending),
    ).toThrow();
    expect(() =>
      assertOrderTransitionAllowed(OrderStatus.refunded, OrderStatus.paid),
    ).toThrow();
  });
});
