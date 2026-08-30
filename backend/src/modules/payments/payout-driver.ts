/**
 * Contrat que tout prestataire de reversement (payout) doit remplir.
 *
 * Miroir volontaire de `payment-driver.ts` : même style d'interface, même
 * séparation entre « analyser/vérifier » (ce fichier, les pilotes concrets) et
 * « décider » (`PayoutsService`, seul à connaître les règles de GeBook — brief
 * §22 : le flux de payout doit passer par cette abstraction, jamais par un
 * pilote concret appelé directement).
 *
 * PAY-IN et PAYOUT restent deux abstractions indépendantes (brief §1) : un
 * même prestataire (PawaPay, CinetPay, FeexPay) peut implémenter l'une, l'autre,
 * les deux, ou aucune — `PaymentProvider.supportsPayout` porte cette capacité
 * séparément de `supportsMobileMoney`/`supportsCard`.
 */

/** Jeton d'injection multi-fournisseurs pour les pilotes de reversement. */
export const PAYOUT_DRIVER = Symbol('PAYOUT_DRIVER');

/** Reflète `payment_providers.supports_payout` et les méthodes réellement offertes. */
export interface PayoutDriverCapabilities {
  supportsMobileMoney: boolean;
  supportsBankTransfer: boolean;
}

export interface PayoutInitRequest {
  /** Clé d'idempotence émise par GeBook, propre à cette tentative de reversement. */
  idempotencyKey: string;
  /** Référence GeBook (`payouts.id`), pas un numéro exposé publiquement. */
  payoutReference: string;
  amountMinor: number;
  currency: string;
  beneficiaryName: string;
  beneficiaryCountry: string;
  /** Numéro Mobile Money ou IBAN/numéro de compte, selon `method`. */
  beneficiaryAccount: string;
  method: string;
}

export interface PayoutInitResult {
  providerTransactionId: string;
  providerReference: string | null;
  raw: unknown;
}

/** Résultat d'une interrogation directe du prestataire — préférée au corps brut du
 * webhook quand le prestataire l'offre (brief §8 : « ne jamais faire confiance au
 * seul corps brut du webhook si une API de vérification serveur-à-serveur existe »). */
export interface PayoutVerification {
  transactionId: string;
  outcome: PayoutOutcome;
  paidAmountMinor: number;
  raw: unknown;
}

/**
 * Issue d'un reversement, exprimée dans le vocabulaire de GeBook. `pending`
 * existe ici (contrairement à `PaymentOutcome`) parce qu'un virement/mobile
 * money sortant reste fréquemment asynchrone au-delà du premier appel API.
 */
export type PayoutOutcome = 'successful' | 'failed' | 'pending';

/** Notification refusée : elle est enregistrée, mais ne déclenche aucun traitement. */
export interface PayoutWebhookRejected {
  signatureValid: false;
  reason: string;
  eventId: string | null;
  eventType: string | null;
  payload: unknown;
}

export interface PayoutWebhookAccepted {
  signatureValid: true;
  /** Identifiant de l'événement chez le prestataire : porte l'idempotence, comme
   * `payment_events.event_id` (contrainte unique en base, jamais applicative seule). */
  eventId: string;
  eventType: string;
  transactionId: string;
  outcome: PayoutOutcome;
  paidAmountMinor: number;
  payload: unknown;
}

export type PayoutWebhookParseResult =
  PayoutWebhookAccepted | PayoutWebhookRejected;

export interface PayoutDriver {
  /** Doit correspondre à `payment_providers.code`. */
  readonly code: string;
  readonly capabilities: PayoutDriverCapabilities;

  initiate(request: PayoutInitRequest): Promise<PayoutInitResult>;

  verify(transactionId: string): Promise<PayoutVerification>;

  /**
   * Analyse et vérifie une notification de reversement. Reçoit le corps brut
   * pour les mêmes raisons que côté pay-in : une signature HMAC se recalcule
   * sur les octets exacts reçus, pas sur une reconstruction JSON.
   *
   * Ne lève jamais : une notification illisible doit pouvoir être enregistrée.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): PayoutWebhookParseResult;
}
