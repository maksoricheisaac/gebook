import type { Payment } from '../../../generated/prisma/client';

/**
 * Vue publique d'une tentative de paiement.
 *
 * N'exposent jamais : `idempotencyKey` (clé interne), `rawResponse` (contenu brut
 * du prestataire, susceptible de contenir des données qui ne regardent pas le
 * client) ni `providerTransactionId` — connaître un identifiant de transaction ne
 * sert à rien au navigateur et facilite le travail d'un attaquant.
 *
 * Les montants restent des chaînes décimales (règle métier n° 12).
 */
export interface PaymentResponse {
  id: string;
  providerCode: string;
  status: string;
  expectedAmount: string;
  paidAmount: string | null;
  currency: string;
  /** Page de paiement du prestataire, ou `null` s'il n'y en a pas. */
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export function toPaymentResponse(
  payment: Payment,
  providerCode: string,
): PaymentResponse {
  return {
    id: payment.id,
    providerCode,
    status: payment.status,
    expectedAmount: payment.expectedAmount.toFixed(2),
    paidAmount: payment.paidAmount?.toFixed(2) ?? null,
    currency: payment.currency,
    checkoutUrl: payment.checkoutUrl,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}
