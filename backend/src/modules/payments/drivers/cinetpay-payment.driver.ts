import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
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

export const CINETPAY_PROVIDER_CODE = 'cinetpay';

const DEFAULT_API_URL = 'https://api-checkout.cinetpay.com/v2';
const REQUEST_TIMEOUT_MS = 15000;

interface CinetPayInitResponse {
  code?: string;
  message?: string;
  description?: string;
  data?: { payment_token?: string; payment_url?: string };
  api_response_id?: string;
}

interface CinetPayCheckResponse {
  code?: string;
  message?: string;
  data?: {
    amount?: number | string;
    currency?: string;
    status?: string;
    payment_method?: string;
    operator_id?: string;
  };
}

/**
 * Pilote pay-in CinetPay (cartes, international — mission plateforme de
 * paiement §1). Deux particularités de leur API, vérifiées contre leur
 * documentation officielle avant d'écrire ce fichier, structurent tout le
 * pilote :
 *
 * 1. Le corps de la notification (`notify_url`) ne contient **jamais** le
 *    vrai statut du paiement — volontairement, pour qu'une notification
 *    forgée ne suffise jamais. `parseWebhook()` doit donc rappeler
 *    `/payment/check` lui-même avant de savoir quel `outcome` renvoyer
 *    (brief §8 : « ne jamais faire confiance au seul corps brut du webhook
 *    si une API de vérification serveur-à-serveur existe »).
 * 2. La signature `X-TOKEN` se vérifie en concaténant les *valeurs* du corps
 *    `application/x-www-form-urlencoded` **dans l'ordre où elles arrivent**
 *    (équivalent de `implode('', $_POST)` côté PHP), avec `CINETPAY_SECRET_KEY`
 *    — distincte de `CINETPAY_API_KEY`, jamais utilisée pour les appels sortants.
 */
@Injectable()
export class CinetPayPaymentDriver implements PaymentDriver {
  readonly code = CINETPAY_PROVIDER_CODE;

  // Capacités volontairement conservatrices (brief §1 : « jamais supposer
  // qu'une méthode est disponible juste parce que la documentation le
  // mentionne ») — seule la carte est confirmée pour ce compte sandbox tant
  // qu'un vrai paiement Mobile Money n'a pas été observé.
  readonly capabilities: DriverCapabilities = {
    supportsMobileMoney: false,
    supportsCard: true,
    supportsRefund: false,
  };

  private readonly logger = new Logger(CinetPayPaymentDriver.name);

  constructor(private readonly config: ConfigService) {}

  async initialize(request: PaymentInitRequest): Promise<PaymentInitResult> {
    const response = await this.post<CinetPayInitResponse>('/payment', {
      apikey: this.apiKey(),
      site_id: this.siteId(),
      // Généré par GeBook (brief §22), garanti unique par la contrainte DB
      // sur `payments.idempotency_key` — satisfait l'exigence CinetPay d'un
      // `transaction_id` neuf à chaque tentative.
      transaction_id: request.idempotencyKey,
      amount: fromMinorUnits(request.amountMinor).toNumber(),
      currency: request.currency,
      description: `Commande GeBook ${request.orderNumber}`.slice(0, 255),
      notify_url: this.notifyUrl(),
      return_url: request.returnUrl,
      channels: 'ALL',
      customer_email: request.customerEmail,
      lang: 'fr',
    });

    if (
      response.code !== '201' ||
      !response.data?.payment_url ||
      !response.data.payment_token
    ) {
      throw new InvalidProviderResponse(
        this.code,
        response.message ?? response.description ?? 'réponse incomplète',
      );
    }

    return {
      // L'identifiant que GeBook a choisi, pas le jeton CinetPay : c'est lui
      // qui reviendra tel quel dans `cpm_trans_id` à la notification, et qui
      // permet à `PaymentsService.handleWebhook()` de retrouver ce paiement
      // (`WHERE provider_transaction_id = ...`).
      providerTransactionId: request.idempotencyKey,
      providerReference: response.data.payment_token,
      checkoutUrl: response.data.payment_url,
      raw: response,
    };
  }

  async verify(transactionId: string): Promise<PaymentVerification> {
    const response = await this.checkTransaction(transactionId);
    const outcome = this.mapStatus(response.data?.status);
    const amountMinor = this.readAmountMinor(response.data?.amount);

    return {
      transactionId,
      outcome: outcome ?? 'failed',
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      // CinetPay ne renvoie aucun frais distinct sur cette route — jamais
      // inventé, laissé à zéro tant qu'aucun champ documenté ne le porte.
      feeMinor: 0,
      raw: response,
    };
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookParseResult> {
    const bodyText = rawBody.toString('utf8');
    const fields = [...new URLSearchParams(bodyText).entries()];

    const rejected = (
      reason: string,
      eventId: string | null = null,
    ): WebhookParseResult => ({
      signatureValid: false,
      reason,
      eventId,
      eventType: null,
      payload: Object.fromEntries(fields),
    });

    const transactionId =
      fields.find(([key]) => key === 'cpm_trans_id')?.[1] ?? null;
    if (!transactionId) {
      return rejected(
        'Notification incomplète : identifiant de transaction absent.',
      );
    }

    const token = this.readHeader(headers, 'x-token');
    if (!token) {
      return rejected('Signature X-TOKEN absente.', transactionId);
    }

    let secret: string;
    try {
      secret = this.config.getOrThrow<string>('CINETPAY_SECRET_KEY');
    } catch {
      return rejected(
        'CINETPAY_SECRET_KEY non configurée côté serveur.',
        transactionId,
      );
    }

    // Concaténation des valeurs dans l'ordre d'arrivée — équivalent exact de
    // `implode('', $_POST)`, la formule documentée par CinetPay.
    const concatenated = fields.map(([, value]) => value).join('');
    const expected = createHmac('sha256', secret)
      .update(concatenated)
      .digest('hex');

    if (!this.timingSafeEqualHex(expected, token)) {
      return rejected('Signature X-TOKEN invalide.', transactionId);
    }

    // Le corps ne porte jamais le vrai statut (voir le commentaire de tête) :
    // seule cette vérification serveur-à-serveur fait foi.
    let verification: CinetPayCheckResponse;
    try {
      verification = await this.checkTransaction(transactionId);
    } catch (error) {
      this.logger.warn(
        `Vérification CinetPay indisponible pour ${transactionId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return rejected(
        'Vérification côté prestataire indisponible pour le moment.',
        transactionId,
      );
    }

    const outcome = this.mapStatus(verification.data?.status);
    if (outcome === null) {
      // PENDING / INITIATED / statut inconnu : pas encore une issue
      // définitive. N'invente ni succès ni échec — la notification suivante
      // (CinetPay peut en émettre plusieurs pour la même transaction)
      // tranchera une fois le statut réellement résolu.
      return rejected(
        `Statut non définitif (${verification.data?.status ?? 'inconnu'}) — en attente de résolution.`,
        transactionId,
      );
    }

    const amountMinor = this.readAmountMinor(verification.data?.amount);

    return {
      signatureValid: true,
      // CinetPay ne fournit pas d'identifiant d'événement propre : dérivé de
      // la transaction et du statut résolu, ce qui porte quand même
      // l'idempotence (règle n° 8) — une notification répétée qui aboutit au
      // même statut vérifié produit le même `eventId`, absorbée par la
      // contrainte unique DB plutôt que retraitée.
      eventId: `${transactionId}:${verification.data?.status ?? 'unknown'}`,
      eventType: `payment.${outcome}`,
      transactionId,
      outcome,
      paidAmountMinor: outcome === 'successful' ? amountMinor : 0,
      feeMinor: 0,
      paymentMethod: verification.data?.payment_method ?? null,
      payload: { notification: Object.fromEntries(fields), verification },
    };
  }

  /**
   * Aucune API de remboursement documentée n'existe côté CinetPay Checkout
   * (recherché avant d'écrire ce fichier — brief : « ne jamais fabriquer un
   * remboursement que le prestataire ne supporte pas réellement »).
   * `capabilities.supportsRefund = false` empêche déjà `PaymentsService`
   * d'appeler cette méthode ; elle existe seulement parce que l'interface
   * `PaymentDriver` l'exige, et refuse explicitement plutôt que de
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

  /** Test de connectivité réel : un appel `/payment/check` sur une
   * transaction inexistante confirme que l'URL, la clé d'API et le site_id
   * sont valides, sans créer ni modifier quoi que ce soit. */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.checkTransaction(
        `gebook-connectivity-check-${Date.now()}`,
      );
      if (!response.code) {
        return {
          ok: false,
          detail:
            'Échec — Cause : réponse du prestataire sans code reconnaissable.',
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

  private async checkTransaction(
    transactionId: string,
  ): Promise<CinetPayCheckResponse> {
    return this.post<CinetPayCheckResponse>('/payment/check', {
      apikey: this.apiKey(),
      site_id: this.siteId(),
      transaction_id: transactionId,
    });
  }

  private mapStatus(status: string | undefined): PaymentOutcome | null {
    switch (status) {
      case 'ACCEPTED':
        return 'successful';
      case 'REFUSED':
      case 'EXPIRED':
        return 'failed';
      default:
        return null;
    }
  }

  private readAmountMinor(amount: number | string | undefined): number {
    if (amount === undefined) return 0;
    return toMinorUnits(new Prisma.Decimal(amount));
  }

  private apiUrl(): string {
    return this.config.get<string>('CINETPAY_API_URL') || DEFAULT_API_URL;
  }

  private apiKey(): string {
    return this.config.getOrThrow<string>('CINETPAY_API_KEY');
  }

  private siteId(): string {
    return this.config.getOrThrow<string>('CINETPAY_SITE_ID');
  }

  private notifyUrl(): string {
    const base = this.config.getOrThrow<string>('API_PUBLIC_URL');
    return `${base.replace(/\/$/, '')}/webhooks/${this.code}`;
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  private timingSafeEqualHex(expectedHex: string, candidate: string): boolean {
    const expected = Buffer.from(expectedHex);
    const received = Buffer.from(candidate);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  /** Ne renvoie jamais `error.message` brut tel quel côté Superadmin — brief
   * §71 : « le frontend ne doit jamais recevoir de détails internes ». */
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
