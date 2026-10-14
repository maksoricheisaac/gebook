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
import { feexPayFailure, rejection } from './feexpay-errors';

export const FEEXPAY_PROVIDER_CODE = 'feexpay';

const DEFAULT_API_URL = 'https://api-v2.feexpay.me';
const REQUEST_TIMEOUT_MS = 15000;

/** Bornes documentées pour MTN Congo Brazzaville, surchargeables par configuration. */
const DEFAULT_MIN_AMOUNT = 100;
const DEFAULT_MAX_AMOUNT = 2_000_000;

/** XAF (Congo) et XOF sont deux monnaies distinctes à parité fixe ; FeexPay
 * ne reçoit aucune devise, seulement un montant entier. */
const ACCEPTED_CURRENCIES = ['XAF', 'XOF'];

/** Format international MTN Congo : 242 + 9 chiffres. */
const CONGO_PHONE = /^242\d{9}$/;
const GENERIC_INTERNATIONAL_PHONE = /^\d{8,15}$/;
const CHANNEL_CODE = /^[a-z0-9_]+$/;

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

  private readonly logger = new Logger(FeexPayPaymentDriver.name);

  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: true,
    supportsCard: false,
    supportsRefund: false,
  };

  constructor(private readonly providerConfig: ProviderConfigService) {}

  async initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    const channel = request.channel ?? (await this.defaultNetwork());
    if (!channel || !CHANNEL_CODE.test(channel)) {
      throw rejection(this.code, 'ERR_PROVIDER_REJECTED');
    }

    const phone = this.validatePhone(request.customerPhone, channel);
    const amount = await this.validateAmount(
      request.amountMinor,
      request.currency,
    );

    const startedAt = Date.now();
    const response = await this.post<FeexPayInitResponse>(
      'payin.initiate',
      `/api/transactions/public/requesttopay/${channel}`,
      {
        phoneNumber: phone,
        amount,
        shop: await this.shopId(),
        description: this.sanitizeText(
          `Commande GeBook ${request.orderNumber}`,
        ),
        // Référence métier non sensible : jamais de donnée personnelle ici.
        callback_info: request.idempotencyKey,
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
      // `PENDING` (ou tout statut non définitif) n'est jamais un échec.
      outcome: outcome ?? 'pending',
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
        'balance.get',
        `/api/balance/public/getByShop/${encodeURIComponent(await this.shopId())}`,
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
      'payin.status',
      `/api/transactions/public/single/status/${encodeURIComponent(transactionId)}`,
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

  private async apiUrl(): Promise<string> {
    return (
      (await this.providerConfig.getOptional(this.code, 'apiUrl')) ??
      DEFAULT_API_URL
    );
  }

  private async apiKey(): Promise<string> {
    return this.providerConfig.get(this.code, 'apiKey');
  }

  private async shopId(): Promise<string> {
    return this.providerConfig.get(this.code, 'shopId');
  }

  private validatePhone(phone: string | undefined, channel: string): string {
    if (!phone) throw rejection(this.code, 'ERR_INVALID_PHONE_NUMBER');
    const digits = normalizePhoneDigits(phone);
    const valid =
      channel === 'mtn_cg'
        ? CONGO_PHONE.test(digits)
        : GENERIC_INTERNATIONAL_PHONE.test(digits);
    if (!valid) throw rejection(this.code, 'ERR_INVALID_PHONE_NUMBER');
    return digits;
  }

  /**
   * Bornes vérifiées côté serveur avant tout appel : la validation du
   * frontend ne compte jamais. Retourne le montant en unités majeures
   * (entier — pas de subdivision du franc CFA).
   */
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

  private async defaultNetwork(): Promise<string | undefined> {
    return this.providerConfig.getOptional(this.code, 'network');
  }

  private async post<T>(
    operation: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>(operation, path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async get<T>(operation: string, path: string): Promise<T> {
    return this.request<T>(operation, path, { method: 'GET' });
  }

  /**
   * Aucun retry ici, volontairement : rejouer une initiation dont la réponse a
   * été perdue pourrait débiter deux fois le lecteur. Un timeout ou une 5xx
   * lève une erreur d'issue *incertaine* (`isUncertainProviderError`) que
   * `PaymentsService` traite en interrogeant le statut, jamais en réémettant.
   *
   * Ne journalise jamais l'en-tête `Authorization`, le corps envoyé (numéro de
   * téléphone) ni le corps reçu.
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
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.apiKey()}`,
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
      const failure = feexPayFailure(this.code, response.status, parsed);
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

    // HTTP 2xx ne veut pas dire succès métier : `success: false` est un refus.
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { success?: unknown }).success === false
    ) {
      const failure = feexPayFailure(this.code, response.status, parsed);
      this.logFailure(
        operation,
        startedAt,
        failure instanceof PaymentRejectedByProvider
          ? failure.code
          : 'SUCCESS_FALSE',
        response.status,
      );
      throw failure;
    }

    this.logger.debug(
      JSON.stringify({
        event: 'feexpay.http',
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
        event: 'feexpay.error',
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
