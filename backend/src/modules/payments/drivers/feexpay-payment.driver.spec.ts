import type { ConfigService } from '@nestjs/config';
import { FeexPayPaymentDriver } from './feexpay-payment.driver';

const ENV: Record<string, string> = {
  FEEXPAY_API_URL: 'https://feexpay.test',
  FEEXPAY_API_KEY: 'apikey-de-test',
  FEEXPAY_SHOP_ID: 'shop-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): FeexPayPaymentDriver {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new FeexPayPaymentDriver(config);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('FeexPayPaymentDriver', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('initialize', () => {
    it('refuse sans numéro de téléphone ni canal', async () => {
      await expect(
        driver().initialize({
          idempotencyKey: 'gb-tx-1',
          orderNumber: 'GB-1',
          amountMinor: 10000,
          currency: 'XOF',
          customerEmail: 'a@example.test',
          returnUrl: 'https://gebook.test/x',
        }),
      ).rejects.toThrow();
    });

    it('envoie le montant en unités majeures vers le canal demandé', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          reference: 'ref-abc',
          message: 'Accepted',
          status: 'PENDING',
        }),
      );

      const result = await driver().initialize({
        idempotencyKey: 'gb-tx-1',
        orderNumber: 'GB-20260813-ABCDEF',
        amountMinor: 10000,
        currency: 'XOF',
        customerEmail: 'lecteur@example.test',
        returnUrl: 'https://gebook.test/paiement/GB-20260813-ABCDEF',
        customerPhone: '242676600000000',
        channel: 'mtn_cg',
      });

      expect(result).toMatchObject({
        providerTransactionId: 'ref-abc',
        providerReference: 'ref-abc',
        checkoutUrl: null,
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://feexpay.test/api/transactions/public/requesttopay/mtn_cg',
      );
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.amount).toBe(100);
      expect(body.phoneNumber).toBe('242676600000000');
      expect(body.shop).toBe('shop-de-test');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer apikey-de-test',
      );
    });

    it('rejette une réponse sans référence', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ message: 'rejected' }));

      await expect(
        driver().initialize({
          idempotencyKey: 'gb-tx-2',
          orderNumber: 'GB-1',
          amountMinor: 100,
          currency: 'XOF',
          customerEmail: 'a@example.test',
          returnUrl: 'https://gebook.test/x',
          customerPhone: '242676600000000',
          channel: 'mtn_cg',
        }),
      ).rejects.toThrow();
    });
  });

  describe('verify', () => {
    it('traduit SUCCESSFUL en succès avec le montant en unités mineures', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'SUCCESSFUL', amount: 100 }));

      const result = await driver().verify('ref-abc');

      expect(result.outcome).toBe('successful');
      expect(result.paidAmountMinor).toBe(10000);
    });

    it('traduit FAILED en échec sans montant payé', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'FAILED', amount: 100 }));

      const result = await driver().verify('ref-abc');

      expect(result.outcome).toBe('failed');
      expect(result.paidAmountMinor).toBe(0);
    });
  });

  describe('parseWebhook', () => {
    it('refuse un corps illisible', async () => {
      const parsed = await driver().parseWebhook(
        Buffer.from('pas du JSON', 'utf8'),
        {},
      );
      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('refuse une notification sans référence identifiable', async () => {
      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ amount: 100 }), 'utf8'),
        {},
      );
      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('accepte une notification dont la référence est vérifiée SUCCESSFUL, quel que soit le statut prétendu dans le corps', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'SUCCESSFUL', amount: 100 }));

      // Le corps prétend FAILED : n'a aucune importance, seul le rappel authentifié compte.
      const parsed = await driver().parseWebhook(
        Buffer.from(
          JSON.stringify({ reference: 'ref-abc', status: 'FAILED' }),
          'utf8',
        ),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        transactionId: 'ref-abc',
        outcome: 'successful',
        paidAmountMinor: 10000,
        paymentMethod: 'mobile_money',
      });
    });

    it('refuse une notification dont la vérification renvoie PENDING', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'PENDING' }));

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ reference: 'ref-abc' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('extrait la référence depuis transref si reference est absent', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'SUCCESSFUL', amount: 100 }));

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ transref: 'ref-xyz' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        transactionId: 'ref-xyz',
      });
    });
  });

  describe('refund', () => {
    it('rejette explicitement : aucune API de remboursement documentée', async () => {
      await expect(driver().refund()).rejects.toThrow();
    });
  });

  describe('testConnection', () => {
    it('confirme la connexion quand le solde répond success:true', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ success: true, data: {} }));

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
