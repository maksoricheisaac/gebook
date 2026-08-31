import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client';
import type { ConnectionTestResult } from '../payment-driver';
import { fromMinorUnits, toMinorUnits } from '../money';
import type {
  PayoutDriver,
  PayoutDriverCapabilities,
  PayoutInitRequest,
  PayoutInitResult,
  PayoutOutcome,
  PayoutVerification,
  PayoutWebhookParseResult,
} from '../payout-driver';
import {
  InvalidProviderResponse,
  ProviderTimeout,
  ProviderUnavailable,
} from '../provider-errors';

export const FEEXPAY_PAYOUT_PROVIDER_CODE = 'feexpay';

const DEFAULT_API_URL = 'https://api-v2.feexpay.me';
const REQUEST_TIMEOUT_MS = 15000;

interface FeexPayPayoutInitResponse {
  reference?: string;
  status?: string;
  message?: string;
}

interface FeexPayPayoutStatusResponse {
  reference?: string;
  amount?: number;
  phoneNumber?: string;
  status?: string;
  reason?: string;
}

interface FeexPayBalanceResponse {
  success?: boolean;
}

/**
 * Pilote payout FeexPay (Mobile Money) — miroir de `FeexPayPaymentDriver`,
 * mêmes règles :
 *
 * - **Aucun code de canal codé en dur** (voir `feexpay-payment.driver.ts`) :
 *   transmis tel quel depuis `request.channel`.
 * - **Vérification obligatoire documentée par FeexPay lui-même** : « Status
 *   verification is mandatory for payouts. After initiating a payout
 *   (PENDING status), you must call this endpoint to confirm the final
 *   status ». `parseWebhook()` ne fait donc jamais confiance au statut porté
 *   par le corps brut (non signé, non documenté) et rappelle systématiquement
 *   `GET /payouts/status/public/:reference` avant de trancher — c'est la
 *   raison directe pour laquelle `PayoutDriver.parseWebhook()` est devenu
 *   asynchrone dans cette phase.
 */
@Injectable()
export class FeexPayPayoutDriver implements PayoutDriver {
  readonly code = FEEXPAY_PAYOUT_PROVIDER_CODE;

  readonly capabilities: PayoutDriverCapabilities = {
    supportsMobileMoney: true,
    // Aucun virement bancaire/IBAN documenté pour FeexPay.
    supportsBankTransfer: false,
  };

  constructor(private readonly config: ConfigService) {}

  async initiate(request: PayoutInitRequest): Promise<PayoutInitResult> {
    if (!request.channel) {
      throw new InvalidProviderResponse(
        this.code,
        'canal (opérateur/pays) requis pour ce prestataire',
      );
    }

    const response = await this.post<FeexPayPayoutInitResponse>(
      `/api/payouts/public/${request.channel}`,
      {
        phoneNumber: request.beneficiaryAccount,
        amount: fromMinorUnits(request.amountMinor).toNumber(),
        shop: this.shopId(),
        motif: this.sanitizeMotif(`Reversement ${request.beneficiaryName}`),
        callback_info: request.idempotencyKey,
      },
    );

    if (!response.reference) {
      throw new InvalidProviderResponse(
        this.code,
        response.message ?? 'réponse incomplète',
      );
    }

    return {
      providerTransactionId: response.reference,
      providerReference: response.reference,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PayoutVerification> {
    const response = await this.checkStatus(transactionId);
    const outcome = this.mapStatus(response.status);
    const amountMinor = this.readAmountMinor(response.amount);

    return {
      transactionId,
      // `pending` existe côté payout (contrairement au pay-in) : un statut
      // encore non résolu reste honnêtement `pending`, jamais fabriqué en
      // succès ou échec.
      outcome: outcome ?? 'pending',
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      raw: response,
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposée par `PayoutDriver` ; FeexPay ne documente aucune signature d'en-tête à vérifier ici.
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<PayoutWebhookParseResult> {
    const payload = this.parseJson(rawBody);

    const rejected = (reason: string): PayoutWebhookParseResult => ({
      signatureValid: false,
      reason,
      eventId: null,
      eventType: null,
      payload: payload ?? { raw: rawBody.toString('utf8').slice(0, 1000) },
    });

    if (!payload) {
      return rejected('Corps de notification illisible.');
    }

    const transactionId = this.extractReference(payload);
    if (!transactionId) {
      return rejected(
        'Notification illisible : aucune référence de transaction identifiable.',
      );
    }

    // Vérification obligatoire (documentée par FeexPay) : le corps n'est
    // jamais authentifié, seul ce rappel fait foi.
    let verification: FeexPayPayoutStatusResponse;
    try {
      verification = await this.checkStatus(transactionId);
    } catch {
      return rejected(
        'Vérification côté prestataire indisponible pour le moment.',
      );
    }

    const outcome = this.mapStatus(verification.status);
    if (outcome === null) {
      return rejected(
        `Statut non définitif (${verification.status ?? 'inconnu'}) — en attente de résolution.`,
      );
    }

    const amountMinor = this.readAmountMinor(verification.amount);

    return {
      signatureValid: true,
      eventId: `${transactionId}:${verification.status ?? 'unknown'}`,
      eventType: `payout.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      payload: { notification: payload, verification },
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.get<FeexPayBalanceResponse>(
        `/api/balance/public/getByShop/${this.shopId()}`,
      );
      if (response.success !== true) {
        return {
          ok: false,
          detail:
            'Échec — Cause : réponse du prestataire sans confirmation de succès.',
        };
      }
      return { ok: true, detail: 'Connexion réussie.' };
    } catch (error) {
      return {
        ok: false,
        detail: `Échec — Cause : ${this.safeErrorDetail(error)}`,
      };
    }
  }

  private async checkStatus(
    transactionId: string,
  ): Promise<FeexPayPayoutStatusResponse> {
    return this.get<FeexPayPayoutStatusResponse>(
      `/api/payouts/status/public/${transactionId}`,
    );
  }

  private mapStatus(status: string | undefined): PayoutOutcome | null {
    switch (status) {
      case 'SUCCESSFUL':
        return 'successful';
      case 'FAILED':
        return 'failed';
      case 'PENDING':
        return 'pending';
      default:
        return null;
    }
  }

  private readAmountMinor(amount: number | undefined): number {
    if (amount === undefined) return 0;
    return toMinorUnits(new Prisma.Decimal(amount));
  }

  private extractReference(payload: Record<string, unknown>): string | null {
    const candidates = ['reference', 'transref', 'serviceref'];
    for (const key of candidates) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    const nested = payload.data;
    if (nested && typeof nested === 'object') {
      return this.extractReference(nested as Record<string, unknown>);
    }
    return null;
  }

  /** `motif` : 30 caractères max, sans caractères spéciaux (contrainte
   * documentée explicitement, plus stricte que `description` côté payin). */
  private sanitizeMotif(value: string): string {
    return value.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 30);
  }

  private apiUrl(): string {
    return this.config.get<string>('FEEXPAY_API_URL') || DEFAULT_API_URL;
  }

  private apiKey(): string {
    return this.config.getOrThrow<string>('FEEXPAY_API_KEY');
  }

  private shopId(): string {
    return this.config.getOrThrow<string>('FEEXPAY_SHOP_ID');
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl()}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderTimeout(this.code);
      }
      throw new ProviderUnavailable(this.code, error);
    } finally {
      clearTimeout(timeout);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new InvalidProviderResponse(this.code, 'corps de réponse non JSON');
    }

    if (!response.ok && response.status >= 500) {
      throw new ProviderUnavailable(this.code, parsed);
    }

    return parsed as T;
  }

  private parseJson(rawBody: Buffer): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private safeErrorDetail(error: unknown): string {
    if (error instanceof ProviderTimeout)
      return 'le prestataire a mis trop de temps à répondre.';
    if (error instanceof ProviderUnavailable)
      return 'le prestataire est indisponible.';
    if (error instanceof InvalidProviderResponse)
      return 'réponse inattendue du prestataire.';
    return 'configuration ou réseau invalide.';
  }
}
