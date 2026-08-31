import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { CinetPayPaymentDriver } from './cinetpay-payment.driver';

const SECRET_KEY = 'secret-x-token-de-test';
const ENV: Record<string, string> = {
  CINETPAY_API_URL: 'https://cinetpay.test/v2',
  CINETPAY_API_KEY: 'apikey-de-test',
  CINETPAY_SITE_ID: 'site-de-test',
  CINETPAY_SECRET_KEY: SECRET_KEY,
  API_PUBLIC_URL: 'https://api.gebook.test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): CinetPayPaymentDriver {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new CinetPayPaymentDriver(config);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function signedNotification(
  fields: Record<string, string>,
  secret = SECRET_KEY,
): { rawBody: Buffer; headers: Record<string, string> } {
  const params = new URLSearchParams(fields);
  const rawBody = Buffer.from(params.toString(), 'utf8');
  const concatenated = [...params.values()].join('');
  const token = createHmac('sha256', secret).update(concatenated).digest('hex');
  return { rawBody, headers: { 'x-token': token } };
}

describe('CinetPayPaymentDriver', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('initialize', () => {
    it("envoie le montant en unités majeures et retourne l'URL de paiement", async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: '201',
          message: 'CREATED',
          data: {
            payment_token: 'tok_abc',
            payment_url: 'https://checkout.cinetpay.test/tok_abc',
          },
        }),
      );

      const result = await driver().initialize({
        idempotencyKey: 'gb-tx-1',
        orderNumber: 'GB-20260813-ABCDEF',
        amountMinor: 150000,
        currency: 'XOF',
        customerEmail: 'lecteur@example.test',
        returnUrl: 'https://gebook.test/paiement/GB-20260813-ABCDEF',
      });

      expect(result).toMatchObject({
        providerTransactionId: 'gb-tx-1',
        providerReference: 'tok_abc',
        checkoutUrl: 'https://checkout.cinetpay.test/tok_abc',
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://cinetpay.test/v2/payment');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.transaction_id).toBe('gb-tx-1');
      expect(body.amount).toBe(1500);
      expect(body.notify_url).toBe('https://api.gebook.test/webhooks/cinetpay');
    });

    it('rejette une réponse sans URL de paiement', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ code: '600', message: 'INVALID' }));

      await expect(
        driver().initialize({
          idempotencyKey: 'gb-tx-2',
          orderNumber: 'GB-1',
          amountMinor: 100,
          currency: 'XOF',
          customerEmail: 'a@example.test',
          returnUrl: 'https://gebook.test/x',
        }),
      ).rejects.toThrow();
    });
  });

  describe('verify', () => {
    it('traduit ACCEPTED en succès avec le montant en unités mineures', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: '00',
          data: { status: 'ACCEPTED', amount: 1500, payment_method: 'CARD' },
        }),
      );

      const result = await driver().verify('gb-tx-1');

      expect(result.outcome).toBe('successful');
      expect(result.paidAmountMinor).toBe(150000);
    });

    it('traduit REFUSED en échec sans montant payé', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: '00',
          data: { status: 'REFUSED', amount: 1500 },
        }),
      );

      const result = await driver().verify('gb-tx-1');

      expect(result.outcome).toBe('failed');
      expect(result.paidAmountMinor).toBe(0);
    });
  });

  describe('parseWebhook', () => {
    it('refuse une notification sans en-tête x-token', async () => {
      const { rawBody } = signedNotification({ cpm_trans_id: 'gb-tx-1' });

      const parsed = await driver().parseWebhook(rawBody, {});

      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('refuse une signature x-token invalide', async () => {
      const { rawBody } = signedNotification({ cpm_trans_id: 'gb-tx-1' });

      const parsed = await driver().parseWebhook(rawBody, {
        'x-token': 'f'.repeat(64),
      });

      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('accepte une notification correctement signée puis vérifiée ACCEPTED', async () => {
      const { rawBody, headers } = signedNotification({
        cpm_trans_id: 'gb-tx-1',
        cpm_amount: '1500',
        cpm_site_id: 'site-de-test',
      });
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: '00',
          data: { status: 'ACCEPTED', amount: 1500, payment_method: 'CARD' },
        }),
      );

      const parsed = await driver().parseWebhook(rawBody, headers);

      expect(parsed).toMatchObject({
        signatureValid: true,
        transactionId: 'gb-tx-1',
        outcome: 'successful',
        paidAmountMinor: 150000,
        paymentMethod: 'CARD',
      });
    });

    it('refuse une notification correctement signée mais dont la vérification renvoie PENDING', async () => {
      const { rawBody, headers } = signedNotification({
        cpm_trans_id: 'gb-tx-1',
      });
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: '00', data: { status: 'PENDING' } }),
        );

      const parsed = await driver().parseWebhook(rawBody, headers);

      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('refuse une notification sans identifiant de transaction', async () => {
      const { rawBody, headers } = signedNotification({ cpm_amount: '1500' });

      const parsed = await driver().parseWebhook(rawBody, headers);

      expect(parsed).toMatchObject({ signatureValid: false });
    });
  });

  describe('refund', () => {
    it('rejette explicitement : aucune API de remboursement documentée', async () => {
      await expect(driver().refund()).rejects.toThrow();
    });
  });

  describe('testConnection', () => {
    it('confirme la connexion quand le prestataire répond avec un code', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: '00', data: { status: 'REFUSED' } }),
        );

      const result = await driver().testConnection();

      expect(result.ok).toBe(true);
    });

    it('signale un échec sans détail interne quand le réseau est indisponible', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new TypeError('network down'));

      const result = await driver().testConnection();

      expect(result.ok).toBe(false);
      expect(result.detail).not.toContain('network down');
    });
  });
});
