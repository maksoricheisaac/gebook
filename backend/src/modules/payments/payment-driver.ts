/**
 * Contrat que tout prestataire de paiement doit remplir.
 *
 * Le cœur de GeBook ne connaît aucun prestataire en particulier (règle métier
 * n° 22) : il ne manipule que cette interface. Ajouter un prestataire consiste à
 * écrire une classe et à l'enregistrer dans `PaymentsModule` — aucun autre fichier
 * ne change.
 *
 * Trois corrections par rapport au contrat PHP d'origine (audit §17 et §33) :
 *
 * - les montants sont des entiers d'unités mineures, jamais des flottants ;
 * - GeBook fournit sa propre clé d'idempotence à l'initialisation ;
 * - `parseWebhook()` reçoit le corps **brut** et se contente d'analyser et de
 *   vérifier. Le traitement métier appartient à `PaymentsService`, seul à
 *   connaître les règles de GeBook.
 */

/** Jeton d'injection multi-fournisseurs : chaque pilote s'enregistre dessous. */
export const PAYMENT_DRIVER = Symbol('PAYMENT_DRIVER');

/** Reflète les colonnes `supports_*` de `payment_providers`. */
export interface DriverCapabilities {
  supportsMobileMoney: boolean;
  supportsCard: boolean;
  supportsRefund: boolean;
}

export interface PaymentInitRequest {
  /** Clé d'idempotence émise par GeBook, propre à cette tentative de paiement. */
  idempotencyKey: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  /** Page vers laquelle le prestataire renvoie le lecteur une fois l'opération finie. */
  returnUrl: string;
}

export interface PaymentInitResult {
  providerTransactionId: string;
  providerReference: string | null;
  /** Page de paiement du prestataire. `null` si le paiement se règle hors ligne. */
  checkoutUrl: string | null;
  raw: unknown;
}

/** Résultat d'une interrogation directe du prestataire. */
export interface PaymentVerification {
  transactionId: string;
  outcome: PaymentOutcome;
  paidAmountMinor: number;
  feeMinor: number;
  raw: unknown;
}

/**
 * Issue d'un paiement, exprimée dans le vocabulaire de GeBook. Chaque pilote
 * traduit le vocabulaire de son prestataire vers ces trois valeurs, ce qui évite
 * de disséminer des `switch` sur des chaînes propriétaires dans le service.
 */
export type PaymentOutcome = 'successful' | 'failed' | 'cancelled';

/** Notification refusée : elle est enregistrée, mais ne déclenche aucun traitement. */
export interface WebhookRejected {
  signatureValid: false;
  /** Motif journalisé dans `payment_events.error_message`. */
  reason: string;
  eventId: string | null;
  eventType: string | null;
  payload: unknown;
}

export interface WebhookAccepted {
  signatureValid: true;
  /** Identifiant de l'événement chez le prestataire : porte l'idempotence (règle n° 8). */
  eventId: string;
  eventType: string;
  transactionId: string;
  outcome: PaymentOutcome;
  paidAmountMinor: number;
  feeMinor: number;
  paymentMethod: string | null;
  payload: unknown;
}

export type WebhookParseResult = WebhookAccepted | WebhookRejected;

export interface RefundResult {
  refunded: boolean;
  raw: unknown;
}

export interface PaymentDriver {
  /** Doit correspondre à `payment_providers.code`. */
  readonly code: string;
  readonly capabilities: DriverCapabilities;

  initialize(request: PaymentInitRequest): Promise<PaymentInitResult>;

  verify(transactionId: string): Promise<PaymentVerification>;

  /**
   * Analyse et vérifie une notification. Reçoit le corps brut, sans quoi aucune
   * signature HMAC ne pourrait être recalculée : `JSON.parse` puis `JSON.stringify`
   * ne redonne pas octet pour octet le message signé par le prestataire.
   *
   * Ne lève jamais : une notification illisible doit pouvoir être enregistrée.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookParseResult;

  refund(transactionId: string, amountMinor: number): Promise<RefundResult>;
}
