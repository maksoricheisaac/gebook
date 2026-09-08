import { Injectable } from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../money';
import { ProviderConfigService } from '../provider-config.service';
import { Prisma } from '../../../generated/prisma/client';
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
import {
  InvalidProviderResponse,
  ProviderTimeout,
  ProviderUnavailable,
} from '../provider-errors';

export const PAWAPAY_PROVIDER_CODE = 'pawapay';

const DEFAULT_API_URL = 'https://api.sandbox.pawapay.io';
const REQUEST_TIMEOUT_MS = 15000;

interface PawaPayDepositInitResponse {
  depositId?: string;
  status?: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED';
  created?: string;
  failureReason?: { failureCode?: string; failureMessage?: string };
}

interface PawaPayDepositData {
  depositId?: string;
  status?:
    'ACCEPTED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'COMPLETED' | 'FAILED';
  amount?: string;
  currency?: string;
  providerTransactionId?: string;
  failureReason?: { failureCode?: string; failureMessage?: string };
}

interface PawaPayDepositStatusResponse {
  status?: 'FOUND' | 'NOT_FOUND';
  data?: PawaPayDepositData;
}

/**
 * Pilote pay-in PawaPay (Mobile Money, Afrique subsaharienne). Vérifié contre
 * la documentation officielle (docs.pawapay.io/v2/api-reference/deposits) le
 * jour de l'écriture de ce fichier :
 *
 * - Authentification par jeton porteur (`Authorization: Bearer`), un seul
 *   jeton par environnement (sandbox/production) — voir `apiUrl()`/`apiToken()`.
 * - `POST /v2/deposits` déclenche un push USSD direct sur le téléphone du
 *   lecteur (« request to pay »), comme FeexPay : aucune page hébergée,
 *   `checkoutUrl: null`. Même règle que FeexPay pour `channel`
 *   (`payer.accountDetails.provider`) : transmis tel quel depuis l'appelant,
 *   aucun code opérateur deviné.
 * - Le corps exact de la notification (`POST` vers l'URL de callback
 *   configurée sur le tableau de bord PawaPay) n'est pas documenté
 *   publiquement pour les dépôts — seul celui des reversements l'est. Même
 *   situation que FeexPay en son temps : `parseWebhook()` ne fait donc jamais
 *   confiance au corps reçu, seulement au rappel authentifié
 *   `GET /v2/deposits/{depositId}`.
 * - Aucune vérification de signature RFC-9421 (PawaPay la propose en option) :
 *   demanderait de récupérer et mettre en cache la clé publique du
 *   prestataire, hors périmètre — le rappel serveur-à-serveur ci-dessus tient
 *   lieu de garantie, comme pour FeexPay.
 * - Aucune API de remboursement n'a été vérifiée pour ce pilote
 *   (`capabilities.supportsRefund = false`).
 */
@Injectable()
export class PawaPayPaymentDriver implements PaymentDriver {
  readonly code = PAWAPAY_PROVIDER_CODE;

  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: true,
    supportsCard: false,
    supportsRefund: false,
  };

  constructor(private readonly providerConfig: ProviderConfigService) {}

  async initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    if (!request.customerPhone || !request.channel) {
      throw new InvalidProviderResponse(
        this.code,
        'numéro de téléphone et canal (opérateur/pays) requis pour ce prestataire',
      );
    }

    const response = await this.post<PawaPayDepositInitResponse>(
      '/v2/deposits',
      {
        depositId: request.idempotencyKey,
        payer: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: request.customerPhone,
            provider: request.channel,
          },
        },
        amount: fromMinorUnits(request.amountMinor).toString(),
        currency: request.currency,
      },
    );

    if (response.status !== 'ACCEPTED' || !response.depositId) {
      throw new InvalidProviderResponse(
        this.code,
        response.failureReason?.failureMessage ??
          response.status ??
          'réponse incomplète',
      );
    }

    return {
      providerTransactionId: response.depositId,
      providerReference: null,
      // Push USSD direct sur le téléphone du lecteur, comme FeexPay : aucune
      // page externe.
      checkoutUrl: null,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const response = await this.checkStatus(transactionId);
    const outcome = this.mapStatus(response.data?.status);
    const amountMinor = this.readAmountMinor(response.data?.amount);

    return {
      transactionId,
      outcome: outcome ?? 'failed',
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      // Aucun frais distinct documenté sur cette route.
      feeMinor: 0,
      raw: response,
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposée par `PaymentDriver` ; le corps de la notification PawaPay n'est pas authentifié ici (voir le commentaire de tête).
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookParseResult> {
    const payload = this.parseJson(rawBody);

    const rejected = (reason: string): WebhookParseResult => ({
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
      typeof payload.depositId === 'string' ? payload.depositId : null;
    if (!transactionId) {
      return rejected(
        'Notification illisible : aucun identifiant de dépôt (depositId) trouvé.',
      );
    }

    // Le corps n'est jamais authentifié ici (voir le commentaire de tête) :
    // seul ce rappel fait foi.
    let verification: PawaPayDepositStatusResponse;
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
      eventType: `payment.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      feeMinor: 0,
      paymentMethod: 'mobile_money',
      payload: { notification: payload, verification },
    };
  }

  /**
   * Aucune API de remboursement n'a été vérifiée pour ce pilote.
   * `capabilities.supportsRefund = false` empêche déjà `PaymentsService`
   * d'appeler cette méthode ; elle refuse explicitement plutôt que de
   * prétendre réussir si jamais elle était appelée quand même.
   */
  refund(): Promise<RefundResult> {
    return Promise.reject(
      new InvalidProviderResponse(
        this.code,
        'remboursement non supporté par ce prestataire',
      ),
    );
  }

  /** Interroge une transaction inexistante : une réponse `NOT_FOUND` (plutôt
   * qu'un 401/réseau) confirme que l'URL et le jeton sont valides, sans aucun
   * effet de bord — même principe que le `/payment/check` de CinetPay. */
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
    depositId: string,
  ): Promise<PawaPayDepositStatusResponse> {
    return this.get<PawaPayDepositStatusResponse>(`/v2/deposits/${depositId}`);
  }

  private mapStatus(
    status: PawaPayDepositData['status'],
  ): PaymentOutcome | null {
    switch (status) {
      case 'COMPLETED':
        return 'successful';
      case 'FAILED':
        return 'failed';
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
