import { Injectable } from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../money';
import { ProviderConfigService } from '../provider-config.service';
import { Prisma } from '../../../generated/prisma/client';
import type { ConnectionTestResult } from '../payment-driver';
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

export const PAWAPAY_PAYOUT_PROVIDER_CODE = 'pawapay';

const DEFAULT_API_URL = 'https://api.sandbox.pawapay.io';
const REQUEST_TIMEOUT_MS = 15000;

interface PawaPayPayoutInitResponse {
  payoutId?: string;
  status?: 'ACCEPTED' | 'REJECTED';
  created?: string;
}

interface PawaPayPayoutData {
  payoutId?: string;
  status?:
    'COMPLETED' | 'FAILED' | 'PROCESSING' | 'ENQUEUED' | 'IN_RECONCILIATION';
  amount?: string;
  currency?: string;
  providerTransactionId?: string;
}

interface PawaPayPayoutStatusResponse {
  status?: 'FOUND' | 'NOT_FOUND';
  data?: PawaPayPayoutData;
}

/**
 * Pilote payout PawaPay — miroir de `PawaPayPaymentDriver`
 * (`pawapay-payment.driver.ts`, voir son commentaire de tête pour le détail
 * des choix communs : auth par jeton, aucune signature vérifiée, rappel
 * systématique avant de trancher un statut).
 *
 * Contrairement aux dépôts, le corps du rappel (callback) de reversement
 * **est** documenté par PawaPay (`payoutId`, `status`, `amount`, `currency`,
 * `recipient`, `providerTransactionId`...) — il reste néanmoins non signé ici
 * (aucune vérification RFC-9421), donc `parseWebhook()` applique la même
 * prudence que pour les dépôts : jamais confiance dans le corps reçu, un
 * rappel `GET /v2/payouts/{payoutId}` tranche seul le statut définitif.
 */
@Injectable()
export class PawaPayPayoutDriver implements PayoutDriver {
  readonly code = PAWAPAY_PAYOUT_PROVIDER_CODE;

  readonly capabilities: PayoutDriverCapabilities = {
    supportsMobileMoney: true,
    // Aucun virement bancaire/IBAN documenté pour PawaPay.
    supportsBankTransfer: false,
  };

  constructor(private readonly providerConfig: ProviderConfigService) {}

  async initiate(request: PayoutInitRequest): Promise<PayoutInitResult> {
    if (!request.channel) {
      throw new InvalidProviderResponse(
        this.code,
        'canal (opérateur/pays) requis pour ce prestataire',
      );
    }

    const response = await this.post<PawaPayPayoutInitResponse>('/v2/payouts', {
      payoutId: request.idempotencyKey,
      amount: fromMinorUnits(request.amountMinor).toString(),
      currency: request.currency,
      recipient: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: request.beneficiaryAccount,
          provider: request.channel,
        },
      },
    });

    if (response.status !== 'ACCEPTED' || !response.payoutId) {
      throw new InvalidProviderResponse(
        this.code,
        response.status ?? 'réponse incomplète',
      );
    }

    return {
      providerTransactionId: response.payoutId,
      providerReference: null,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PayoutVerification> {
    const response = await this.checkStatus(transactionId);
    const outcome = this.mapStatus(response.data?.status);
    const amountMinor = this.readAmountMinor(response.data?.amount);

    return {
      transactionId,
      // `pending` existe côté payout : un statut encore non résolu reste
      // honnêtement `pending`, jamais fabriqué en succès ou échec.
      outcome: outcome ?? 'pending',
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      raw: response,
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposée par `PayoutDriver` ; voir le commentaire de tête.
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

    const transactionId =
      typeof payload.payoutId === 'string' ? payload.payoutId : null;
    if (!transactionId) {
      return rejected(
        'Notification illisible : aucun identifiant de reversement (payoutId) trouvé.',
      );
    }

    let verification: PawaPayPayoutStatusResponse;
    try {
      verification = await this.checkStatus(transactionId);
    } catch {
      return rejected(
        'Vérification côté prestataire indisponible pour le moment.',
      );
    }

    const outcome = this.mapStatus(verification.data?.status);
    if (outcome === null) {
      return rejected(
        `Statut non définitif (${verification.data?.status ?? 'inconnu'}) — en attente de résolution.`,
      );
    }

    const amountMinor = this.readAmountMinor(verification.data?.amount);

    return {
      signatureValid: true,
      eventId: `${transactionId}:${verification.data?.status ?? 'unknown'}`,
      eventType: `payout.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      payload: { notification: payload, verification },
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.checkStatus(
        `gebook-connectivity-check-${Date.now()}`,
      );
      if (response.status !== 'FOUND' && response.status !== 'NOT_FOUND') {
        return {
          ok: false,
          detail:
            'Échec — Cause : réponse du prestataire sans statut reconnaissable.',
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
    payoutId: string,
  ): Promise<PawaPayPayoutStatusResponse> {
    return this.get<PawaPayPayoutStatusResponse>(`/v2/payouts/${payoutId}`);
  }

  private mapStatus(status: PawaPayPayoutData['status']): PayoutOutcome | null {
    switch (status) {
      case 'COMPLETED':
        return 'successful';
      case 'FAILED':
        return 'failed';
      case 'PROCESSING':
      case 'ENQUEUED':
      case 'IN_RECONCILIATION':
        return 'pending';
      default:
        return null;
    }
  }

  private readAmountMinor(amount: string | undefined): number {
    if (amount === undefined) return 0;
    return toMinorUnits(new Prisma.Decimal(amount));
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

  private async apiUrl(): Promise<string> {
    return (
      (await this.providerConfig.getOptional(this.code, 'apiUrl')) ??
      DEFAULT_API_URL
    );
  }

  private async apiToken(): Promise<string> {
    return this.providerConfig.get(this.code, 'apiToken');
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
      response = await fetch(`${await this.apiUrl()}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.apiToken()}`,
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
