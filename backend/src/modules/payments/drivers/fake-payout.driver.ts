import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PayoutDriver,
  PayoutDriverCapabilities,
  PayoutInitRequest,
  PayoutInitResult,
  PayoutOutcome,
  PayoutVerification,
  PayoutWebhookParseResult,
} from '../payout-driver';

export const FAKE_PAYOUT_PROVIDER_CODE = 'fake';

export const PAYOUT_SIGNATURE_HEADER = 'x-gebook-payout-signature';
export const PAYOUT_TIMESTAMP_HEADER = 'x-gebook-payout-timestamp';

/** Même fenêtre anti-rejeu que côté pay-in (`fake-payment.driver.ts`). */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

const OUTCOMES: readonly PayoutOutcome[] = ['successful', 'failed', 'pending'];

interface FakePayoutWebhookPayload {
  eventId?: unknown;
  eventType?: unknown;
  transactionId?: unknown;
  status?: unknown;
  amountMinor?: unknown;
}

/**
 * Prestataire de reversement de simulation, miroir de `FakePaymentDriver` côté
 * pay-in. Réutilise `PAYMENT_WEBHOOK_SECRET` plutôt qu'un secret dédié : c'est
 * le même usage (signer une notification simulée en développement/CI), pas un
 * vrai compte marchand — un secret supplémentaire n'apporterait aucune garantie
 * de plus, seulement une variable d'environnement de plus à retenir.
 *
 * Permet de tester l'architecture PayoutDriver/PayoutDriverRegistry (Phase 1)
 * sans attendre des identifiants sandbox réels PawaPay/CinetPay/FeexPay.
 */
@Injectable()
export class FakePayoutDriver implements PayoutDriver {
  readonly code = FAKE_PAYOUT_PROVIDER_CODE;

  readonly capabilities: PayoutDriverCapabilities = {
    supportsMobileMoney: true,
    supportsBankTransfer: true,
  };

  constructor(private readonly config: ConfigService) {}

  initiate(request: PayoutInitRequest): Promise<PayoutInitResult> {
    return Promise.resolve({
      providerTransactionId: `fake_payout_${randomUUID()}`,
      providerReference: request.payoutReference,
      raw: {
        provider: this.code,
        idempotencyKey: request.idempotencyKey,
        amountMinor: request.amountMinor,
        currency: request.currency,
        method: request.method,
      },
    });
  }

  verify(transactionId: string): Promise<PayoutVerification> {
    // Comme le pilote factice de pay-in : pas d'état à interroger, la vérité
    // vient des notifications qu'on lui fait émettre.
    return Promise.resolve({
      transactionId,
      outcome: 'pending',
      paidAmountMinor: 0,
      raw: { provider: this.code, verified: false },
    });
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): PayoutWebhookParseResult {
    const payload = this.parseJson(rawBody);

    const eventId = this.readString(payload?.eventId);
    const eventType = this.readString(payload?.eventType);
    const rejected = (reason: string): PayoutWebhookParseResult => ({
      signatureValid: false,
      reason,
      eventId,
      eventType,
      payload: payload ?? { raw: rawBody.toString('utf8').slice(0, 1000) },
    });

    if (!payload) {
      return rejected('Corps de notification illisible.');
    }

    const timestamp = Number(this.readHeader(headers, PAYOUT_TIMESTAMP_HEADER));
    if (!Number.isFinite(timestamp)) {
      return rejected('Horodatage de notification absent ou invalide.');
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
      return rejected('Notification trop ancienne : rejeu probable.');
    }

    const signature = this.readHeader(headers, PAYOUT_SIGNATURE_HEADER);
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
      eventType: eventType ?? `payout.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: amountMinor,
      payload,
    };
  }

  /** Signe un corps de notification comme le ferait le prestataire — utilisée
   * par les tests, le secret ne quitte jamais l'API. */
  signWebhook(
    rawBody: Buffer,
    timestampSeconds = Math.floor(Date.now() / 1000),
  ): Record<string, string> {
    return {
      [PAYOUT_TIMESTAMP_HEADER]: String(timestampSeconds),
      [PAYOUT_SIGNATURE_HEADER]: this.computeSignature(
        rawBody,
        timestampSeconds,
      ),
    };
  }

  private computeSignature(rawBody: Buffer, timestampSeconds: number): string {
    const secret = this.config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET');
    return createHmac('sha256', secret)
      .update(`payout.${timestampSeconds}.`)
      .update(rawBody)
      .digest('hex');
  }

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

  private parseJson(rawBody: Buffer): FakePayoutWebhookPayload | null {
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

  private readOutcome(value: unknown): PayoutOutcome | null {
    return OUTCOMES.find((outcome) => outcome === value) ?? null;
  }
}
