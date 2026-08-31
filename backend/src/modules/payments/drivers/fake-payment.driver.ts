import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConnectionTestResult,
  DriverCapabilities,
  PaymentDriver,
  PaymentInitRequest,
  PaymentInitResult,
  PaymentOutcome,
  PaymentVerification,
  RefundResult,
  WebhookParseResult,
} from '../payment-driver';

export const FAKE_PROVIDER_CODE = 'fake';

export const SIGNATURE_HEADER = 'x-gebook-signature';
export const TIMESTAMP_HEADER = 'x-gebook-timestamp';

/**
 * Fenêtre d'acceptation d'une notification. Au-delà, le message est considéré
 * comme un rejeu : un attaquant qui capture une notification valide ne doit pas
 * pouvoir la rejouer indéfiniment (audit §33, étape 3).
 */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

const OUTCOMES: readonly PaymentOutcome[] = [
  'successful',
  'failed',
  'cancelled',
];

/** Corps de notification du prestataire factice, tel qu'il circule sur le réseau. */
interface FakeWebhookPayload {
  eventId?: unknown;
  eventType?: unknown;
  transactionId?: unknown;
  status?: unknown;
  amountMinor?: unknown;
  feeMinor?: unknown;
  paymentMethod?: unknown;
}

/**
 * Prestataire de simulation.
 *
 * Le pilote factice de la version PHP retournait toujours un succès, ce qui ne
 * permettait de tester qu'un seul chemin. Celui-ci sait produire et vérifier de
 * vraies signatures HMAC, et laisse l'appelant simuler l'échec, l'annulation, un
 * montant incorrect, une signature invalide, un doublon et un rejeu — sans compte
 * marchand. C'est l'outil qui rend les règles métier n° 8, 9 et 10 testables ;
 * il mérite donc plus de soin que le pilote réel (audit §33).
 */
@Injectable()
export class FakePaymentDriver implements PaymentDriver {
  readonly code = FAKE_PROVIDER_CODE;

  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: true,
    supportsCard: true,
    supportsRefund: true,
  };

  constructor(private readonly config: ConfigService) {}

  initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    return Promise.resolve({
      providerTransactionId: `fake_tx_${randomUUID()}`,
      providerReference: request.orderNumber,
      // Aucune page externe : le règlement se simule depuis GeBook, ce que
      // l'interface annonce explicitement au lecteur.
      checkoutUrl: null,
      raw: {
        provider: this.code,
        idempotencyKey: request.idempotencyKey,
        amountMinor: request.amountMinor,
        currency: request.currency,
        returnUrl: request.returnUrl,
      },
    });
  }

  verify(transactionId: string): Promise<PaymentVerification> {
    // Un prestataire factice n'a pas d'état à interroger : la vérité vient des
    // notifications qu'on lui fait émettre.
    return Promise.resolve({
      transactionId,
      outcome: 'failed',
      paidAmountMinor: 0,
      feeMinor: 0,
      raw: { provider: this.code, verified: false },
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- signature imposée par `PaymentDriver` (certains pilotes réels doivent réellement attendre un appel réseau ici).
  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookParseResult> {
    const payload = this.parseJson(rawBody);

    const eventId = this.readString(payload?.eventId);
    const eventType = this.readString(payload?.eventType);
    const rejected = (reason: string): WebhookParseResult => ({
      signatureValid: false,
      reason,
      eventId,
      eventType,
      payload: payload ?? { raw: rawBody.toString('utf8').slice(0, 1000) },
    });

    if (!payload) {
      return rejected('Corps de notification illisible.');
    }

    const timestamp = Number(this.readHeader(headers, TIMESTAMP_HEADER));
    if (!Number.isFinite(timestamp)) {
      return rejected('Horodatage de notification absent ou invalide.');
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
      return rejected('Notification trop ancienne : rejeu probable.');
    }

    const signature = this.readHeader(headers, SIGNATURE_HEADER);
    if (!signature || !this.signatureMatches(rawBody, timestamp, signature)) {
      return rejected('Signature de notification invalide.');
    }

    const transactionId = this.readString(payload.transactionId);
    const outcome = this.readOutcome(payload.status);
    const amountMinor = this.readInteger(payload.amountMinor);

    if (!eventId || !transactionId || !outcome || amountMinor === null) {
      return rejected('Notification incomplète.');
    }

    return {
      signatureValid: true,
      eventId,
      eventType: eventType ?? `payment.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: amountMinor,
      feeMinor: this.readInteger(payload.feeMinor) ?? 0,
      paymentMethod: this.readString(payload.paymentMethod),
      payload,
    };
  }

  refund(transactionId: string, amountMinor: number): Promise<RefundResult> {
    return Promise.resolve({
      refunded: true,
      raw: { provider: this.code, transactionId, amountMinor },
    });
  }

  /** Aucun réseau réel à joindre : le seul vrai prérequis est que le secret de
   * signature soit configuré, ce que `getOrThrow` vérifie effectivement. */
  testConnection(): Promise<ConnectionTestResult> {
    try {
      this.config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET');
      return Promise.resolve({
        ok: true,
        detail:
          'Connexion réussie (prestataire de simulation, aucun réseau réel sollicité).',
      });
    } catch {
      return Promise.resolve({
        ok: false,
        detail: 'Échec — Cause : PAYMENT_WEBHOOK_SECRET manquant.',
      });
    }
  }

  /**
   * Signe un corps de notification comme le ferait le prestataire. Utilisée par
   * l'endpoint de simulation et par les tests : le secret ne quitte jamais l'API.
   */
  signWebhook(
    rawBody: Buffer,
    timestampSeconds = Math.floor(Date.now() / 1000),
  ): Record<string, string> {
    return {
      [TIMESTAMP_HEADER]: String(timestampSeconds),
      [SIGNATURE_HEADER]: this.computeSignature(rawBody, timestampSeconds),
    };
  }

  private computeSignature(rawBody: Buffer, timestampSeconds: number): string {
    const secret = this.config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET');
    return createHmac('sha256', secret)
      .update(`${timestampSeconds}.`)
      .update(rawBody)
      .digest('hex');
  }

  /**
   * Comparaison à temps constant : une comparaison `===` fuit, par sa durée, le
   * nombre d'octets corrects et permet de reconstruire une signature valide.
   */
  private signatureMatches(
    rawBody: Buffer,
    timestamp: number,
    candidate: string,
  ): boolean {
    const expected = Buffer.from(this.computeSignature(rawBody, timestamp));
    const received = Buffer.from(candidate);

    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private parseJson(rawBody: Buffer): FakeWebhookPayload | null {
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private readInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }

  private readOutcome(value: unknown): PaymentOutcome | null {
    return OUTCOMES.find((outcome) => outcome === value) ?? null;
  }
}
