import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromMinorUnits, toMinorUnits } from '../money';
import { maskPhone, normalizePhoneDigits } from '../phone';
import { ProviderConfigService } from '../provider-config.service';
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
  PaymentRejectedByProvider,
  ProviderTimeout,
  ProviderUnavailable,
} from '../provider-errors';
import { openPayFailure, rejection } from './openpay-errors';

export const OPENPAY_PROVIDER_CODE = 'openpay';

const DEFAULT_API_URL = 'https://api.openpay-cg.com';
const REQUEST_TIMEOUT_MS = 15000;

const DEFAULT_MIN_AMOUNT = 100;
const DEFAULT_MAX_AMOUNT = 2_000_000;

/** OpenPay Congo ne traite que le franc CFA CEMAC. */
const ACCEPTED_CURRENCIES = ['XAF'];

/** Format documenté : 242 + 9 chiffres. */
const CONGO_PHONE = /^242\d{9}$/;

/** Canal GeBook (minuscules) → opérateur OpenPay. */
const PROVIDERS: Record<string, 'MTN' | 'AIRTEL'> = {
  mtn: 'MTN',
  airtel: 'AIRTEL',
};

interface OpenPayTransactionResponse {
  reference?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  message?: string;
}

/**
 * Pilote pay-in OpenPay (Mobile Money MTN/Airtel, Congo Brazzaville).
 *
 * Comme FeexPay, OpenPay déclenche lui-même le paiement (push sur le
 * téléphone du lecteur) : `initialize()` exige un numéro et un canal
 * (`mtn` | `airtel`, ou celui par défaut de la configuration). Le « lien de
 * paiement » hébergé d'OpenPay n'est volontairement pas utilisé : il ne
 * renvoie pas de référence de transaction exploitable pour le rapprochement.
 *
 * **Aucune signature de callback n'est documentée.** `parseWebhook()` ignore
 * donc le statut du corps et ne se fie qu'à un rappel authentifié de l'API de
 * statut (même défense que FeexPay) : sans cela, n'importe qui pourrait POSTer
 * un faux succès sur l'URL de callback.
 */
@Injectable()
export class OpenPayPaymentDriver implements PaymentDriver {
  readonly code = OPENPAY_PROVIDER_CODE;

  private readonly logger = new Logger(OpenPayPaymentDriver.name);

  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: true,
    supportsCard: false,
    supportsRefund: false,
  };

  constructor(private readonly providerConfig: ProviderConfigService) {}

  async initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    const channel = (
      request.channel ?? (await this.defaultNetwork())
    )?.toLowerCase();
    const provider = channel ? PROVIDERS[channel] : undefined;
    if (!provider) throw rejection(this.code, 'ERR_PROVIDER_REJECTED');

    const phone = this.validatePhone(request.customerPhone);
    const amount = await this.validateAmount(
      request.amountMinor,
      request.currency,
    );

    const startedAt = Date.now();
    const response = await this.request<OpenPayTransactionResponse>(
      'payin.initiate',
      '/v1/transaction/payment',
      {
        method: 'POST',
        body: JSON.stringify({
          amount,
          payment_phone_number: phone,
          provider,
          // Référence métier non sensible : jamais de donnée personnelle ici.
          metadata: {
            order_number: request.orderNumber,
            idempotency_key: request.idempotencyKey,
          },
        }),
      },
    );

    if (!response.reference) {
      throw new InvalidProviderResponse(
        this.code,
        'réponse sans référence de transaction',
      );
    }

    this.logger.log(
      JSON.stringify({
        event: 'payment.initiated',
        provider: this.code,
        channel,
        providerReference: response.reference,
        amount,
        status: response.status,
        phone: maskPhone(phone),
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      providerTransactionId: response.reference,
      providerReference: response.reference,
      // Push direct sur le téléphone du lecteur : aucune page externe.
      checkoutUrl: null,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const response = await this.checkStatus(transactionId);
    const outcome = this.mapStatus(response.status);

    return {
      transactionId,
      // `pending` (ou tout statut inconnu) n'est jamais un échec.
      outcome: outcome ?? 'pending',
      paidAmountMinor:
        outcome === 'successful' ? this.readAmountMinor(response.amount) : 0,
      feeMinor: 0,
      raw: response,
    };
  }

  // `headers` imposé par `PaymentDriver` ; OpenPay ne documente aucune
  // signature à vérifier (voir le commentaire de tête).
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

    if (!payload) return rejected('Corps de notification illisible.');

    const transactionId = payload.reference;
    if (typeof transactionId !== 'string' || transactionId.length === 0) {
      return rejected(
        'Notification illisible : aucune référence de transaction identifiable.',
      );
    }

    let verification: OpenPayTransactionResponse;
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

    return {
      // « signatureValid » signifie ici « confirmé par un rappel authentifié
      // vers l'API OpenPay », faute de signature fournie par le prestataire.
      signatureValid: true,
      eventId: `${transactionId}:${verification.status}`,
      eventType: `payment.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor:
        outcome === 'successful'
          ? this.readAmountMinor(verification.amount)
          : 0,
      feeMinor: 0,
      paymentMethod: 'mobile_money',
      payload: { notification: payload, verification },
    };
  }

  /** Aucune API de remboursement documentée ; `supportsRefund = false` l'écarte déjà. */
  refund(): Promise<RefundResult> {
    return Promise.reject(
      new InvalidProviderResponse(
        this.code,
        'remboursement non supporté par ce prestataire',
      ),
    );
  }

  /**
   * OpenPay n'expose aucun endpoint à effet de bord nul pour valider la clé :
   * on interroge le statut d'une référence inexistante. 404 = clé acceptée
   * (la ressource seule est introuvable) ; 401/403 = clé refusée.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.checkStatus('GEBOOK-CONNECTION-TEST');
      return { ok: true, detail: 'Connexion réussie.' };
    } catch (error) {
      if (
        error instanceof PaymentRejectedByProvider &&
        error.code === 'NOT_FOUND'
      ) {
        return { ok: true, detail: 'Connexion réussie.' };
      }
      return {
        ok: false,
        detail: `Échec — Cause : ${this.safeErrorDetail(error)}`,
      };
    }
  }

  private checkStatus(
    transactionId: string,
  ): Promise<OpenPayTransactionResponse> {
    return this.request<OpenPayTransactionResponse>(
      'payin.status',
      `/v1/transaction/status/${encodeURIComponent(transactionId)}`,
      { method: 'GET' },
    );
  }

  private mapStatus(status: string | undefined): PaymentOutcome | null {
    switch (status) {
      case 'success':
        return 'successful';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        return null;
    }
  }

  private readAmountMinor(amount: string | number | undefined): number {
    if (amount === undefined) return 0;
    try {
      return toMinorUnits(new Prisma.Decimal(amount));
    } catch {
      return 0;
    }
  }

  private async apiUrl(): Promise<string> {
    return (
      (await this.providerConfig.getOptional(this.code, 'apiUrl')) ??
      DEFAULT_API_URL
    );
  }

  private validatePhone(phone: string | undefined): string {
    if (!phone) throw rejection(this.code, 'ERR_INVALID_PHONE_NUMBER');
    const digits = normalizePhoneDigits(phone);
    if (!CONGO_PHONE.test(digits)) {
      throw rejection(this.code, 'ERR_INVALID_PHONE_NUMBER');
    }
    return digits;
  }

  /** Bornes vérifiées côté serveur : la validation du frontend ne compte jamais. */
  private async validateAmount(
    amountMinor: number,
    currency: string,
  ): Promise<number> {
    const amount = fromMinorUnits(amountMinor);
    if (
      !ACCEPTED_CURRENCIES.includes(currency) ||
      !Number.isInteger(amountMinor) ||
      !amount.isInteger()
    ) {
      throw rejection(this.code, 'ERR_INVALID_AMOUNT');
    }
    const [min, max] = await Promise.all([
      this.readBound('minAmount', DEFAULT_MIN_AMOUNT),
      this.readBound('maxAmount', DEFAULT_MAX_AMOUNT),
    ]);
    const value = amount.toNumber();
    if (value < min || value > max) {
      throw rejection(this.code, 'ERR_INVALID_AMOUNT');
    }
    return value;
  }

  private async readBound(key: string, fallback: number): Promise<number> {
    const raw = await this.providerConfig.getOptional(this.code, key);
    const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private defaultNetwork(): Promise<string | undefined> {
    return this.providerConfig.getOptional(this.code, 'network');
  }

  /**
   * Aucun retry, volontairement : rejouer une initiation dont la réponse a été
   * perdue pourrait débiter deux fois le lecteur. Un timeout ou une 5xx lève
   * une erreur d'issue *incertaine* que `PaymentsService` traite en
   * interrogeant le statut. Ne journalise jamais la clé API ni les corps.
   */
  private async request<T>(
    operation: string,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(`${await this.apiUrl()}${path}`, {
        ...init,
        headers: {
          'XO-API-KEY': await this.providerConfig.get(this.code, 'apiKey'),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      this.logFailure(operation, startedAt, timedOut ? 'TIMEOUT' : 'NETWORK');
      if (timedOut) throw new ProviderTimeout(this.code);
      throw new ProviderUnavailable(this.code, error);
    } finally {
      clearTimeout(timeout);
    }

    let parsed: unknown = null;
    let jsonError = false;
    try {
      parsed = await response.json();
    } catch {
      jsonError = true;
    }

    if (!response.ok) {
      const failure = openPayFailure(this.code, response.status, parsed);
      this.logFailure(
        operation,
        startedAt,
        failure instanceof PaymentRejectedByProvider
          ? failure.code
          : `HTTP_${response.status}`,
        response.status,
      );
      throw failure;
    }

    if (jsonError) {
      this.logFailure(operation, startedAt, 'INVALID_JSON', response.status);
      throw new InvalidProviderResponse(this.code, 'corps de réponse non JSON');
    }

    this.logger.debug(
      JSON.stringify({
        event: 'openpay.http',
        operation,
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
      }),
    );
    return parsed as T;
  }

  private logFailure(
    operation: string,
    startedAt: number,
    errorCode: string,
    httpStatus?: number,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'openpay.error',
        operation,
        httpStatus,
        errorCode,
        durationMs: Date.now() - startedAt,
      }),
    );
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
    if (error instanceof PaymentRejectedByProvider) return error.userMessage;
    if (error instanceof ProviderTimeout)
      return 'le prestataire a mis trop de temps à répondre.';
    if (error instanceof ProviderUnavailable)
      return 'le prestataire est indisponible.';
    if (error instanceof InvalidProviderResponse)
      return 'réponse inattendue du prestataire.';
    return 'configuration ou réseau invalide.';
  }
}
