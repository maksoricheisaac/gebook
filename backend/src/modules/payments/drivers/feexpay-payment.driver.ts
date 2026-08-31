import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client';
import { fromMinorUnits, toMinorUnits } from '../money';
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

export const FEEXPAY_PROVIDER_CODE = 'feexpay';

const DEFAULT_API_URL = 'https://api-v2.feexpay.me';
const REQUEST_TIMEOUT_MS = 15000;

interface FeexPayInitResponse {
  reference?: string;
  message?: string;
  status?: string;
}

interface FeexPayStatusResponse {
  reference?: string;
  amount?: number;
  phoneNumber?: string;
  status?: string;
  reason?: string;
  operator_id?: string;
}

interface FeexPayBalanceResponse {
  success?: boolean;
}

/**
 * Pilote pay-in FeexPay (Mobile Money, Bénin/Togo/Côte d'Ivoire/Congo
 * Brazzaville/Sénégal/Burkina Faso/Mali).
 *
 * Contrairement à CinetPay (page hébergée) ou au pilote factice, FeexPay
 * déclenche lui-même le paiement (« request to pay », un push USSD envoyé
 * directement au téléphone du lecteur) : `initialize()` exige donc un
 * numéro de téléphone et un canal (opérateur + pays), inexistants avant ce
 * pilote — voir les champs optionnels ajoutés à `PaymentInitRequest`.
 *
 * **Aucun code de canal n'est codé en dur ici.** La documentation officielle
 * ne liste explicitement qu'un seul canal confirmé (`mtn_cg`, MTN Congo
 * Brazzaville) parmi les sept pays annoncés ; deviner les autres (`mtn_bj`,
 * `moov_ci`, `wave_sn`…) violerait la règle « ne jamais fabriquer ce qui
 * n'est pas vérifié ». Le canal est donc transmis tel quel depuis l'appelant
 * (`request.channel`) directement dans l'URL — FeexPay répond lui-même
 * `{channel} channel not configured` (404, documenté) si le code est
 * invalide, ce qui est la seule source de vérité fiable ici.
 *
 * **Aucune signature de notification n'est documentée** pour FeexPay
 * (contrairement au X-TOKEN de CinetPay) : `parseWebhook()` ignore donc
 * entièrement le statut porté par le corps brut et ne fait jamais confiance
 * qu'à un rappel authentifié vers l'API de statut (même défense que
 * CinetPay, appliquée ici par nécessité plutôt que par choix — sans elle,
 * n'importe qui pourrait POSTer un faux succès sur cette URL).
 */
@Injectable()
export class FeexPayPaymentDriver implements PaymentDriver {
  readonly code = FEEXPAY_PROVIDER_CODE;

  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: true,
    supportsCard: false,
    supportsRefund: false,
  };

  constructor(private readonly config: ConfigService) {}

  async initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    if (!request.customerPhone || !request.channel) {
      throw new InvalidProviderResponse(
        this.code,
        'numéro de téléphone et canal (opérateur/pays) requis pour ce prestataire',
      );
    }

    const response = await this.post<FeexPayInitResponse>(
      `/api/transactions/public/requesttopay/${request.channel}`,
      {
        phoneNumber: request.customerPhone,
        amount: fromMinorUnits(request.amountMinor).toNumber(),
        shop: this.shopId(),
        description: this.sanitizeText(
          `Commande GeBook ${request.orderNumber}`,
        ),
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
      // Push USSD direct sur le téléphone du lecteur : aucune page externe.
      checkoutUrl: null,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const response = await this.checkStatus(transactionId);
    const outcome = this.mapStatus(response.status);
    const amountMinor = this.readAmountMinor(response.amount);

    return {
      transactionId,
      outcome: outcome ?? 'failed',
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      // Aucun frais distinct dans la réponse de statut FeexPay.
      feeMinor: 0,
      raw: response,
    };
  }

  // Signature `headers` imposée par `PaymentDriver` ; FeexPay ne documente
  // aucune signature d'en-tête à vérifier ici (voir le commentaire de tête).
  async parseWebhook(
    rawBody: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // Aucune forme de notification unitaire (payin/payout) n'est documentée
    // par FeexPay — seule celle du lot d'historique asynchrone l'est. On
    // tente donc plusieurs noms de champ plausibles pour la référence,
    // jamais un seul supposé à l'aveugle.
    const transactionId = this.extractReference(payload);
    if (!transactionId) {
      return rejected(
        'Notification illisible : aucune référence de transaction identifiable.',
      );
    }

    // Le corps n'est jamais authentifié (pas de signature documentée) : le
    // statut qu'il prétend porter n'est jamais utilisé tel quel, seul le
    // rappel authentifié ci-dessous fait foi.
    let verification: FeexPayStatusResponse;
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
      // « signatureValid » signifie ici « confirmé par un rappel authentifié
      // vers l'API FeexPay », faute de toute signature cryptographique
      // fournie par le prestataire lui-même — voir le commentaire de tête.
      signatureValid: true,
      eventId: `${transactionId}:${verification.status ?? 'unknown'}`,
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
   * Aucune API de remboursement n'est documentée pour FeexPay pay-in.
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

  /** Sonde le solde de la boutique : confirme à la fois la clé d'API et
   * l'identifiant de boutique, sans effet de bord. */
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
  ): Promise<FeexPayStatusResponse> {
    return this.get<FeexPayStatusResponse>(
      `/api/transactions/public/single/status/${transactionId}`,
    );
  }

  private mapStatus(status: string | undefined): PaymentOutcome | null {
    switch (status) {
      case 'SUCCESSFUL':
        return 'successful';
      case 'FAILED':
        return 'failed';
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

  private sanitizeText(value: string): string {
    return value.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 100);
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
