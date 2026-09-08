import { PawaPayPaymentDriver } from './pawapay-payment.driver';
import { fakeProviderConfig } from './test-support/fake-provider-config';

const ENV: Record<string, string> = {
  PAWAPAY_API_URL: 'https://pawapay.test',
  PAWAPAY_API_TOKEN: 'token-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): PawaPayPaymentDriver {
  return new PawaPayPaymentDriver(fakeProviderConfig(env));
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('PawaPayPaymentDriver', () => {
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
          currency: 'ZMW',
          customerEmail: 'a@example.test',
          returnUrl: 'https://gebook.test/x',
        }),
      ).rejects.toThrow();
    });

    it('envoie le dépôt vers /v2/deposits avec le montant en unités majeures', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          depositId: 'gb-tx-1',
          status: 'ACCEPTED',
          created: '2026-09-08T00:00:00Z',
        }),
      );

      const result = await driver().initialize({
        idempotencyKey: 'gb-tx-1',
        orderNumber: 'GB-20260813-ABCDEF',
        amountMinor: 10000,
        currency: 'ZMW',
        customerEmail: 'lecteur@example.test',
        returnUrl: 'https://gebook.test/paiement/GB-20260813-ABCDEF',
        customerPhone: '260763456789',
        channel: 'MTN_MOMO_ZMB',
      });

      expect(result).toMatchObject({
        providerTransactionId: 'gb-tx-1',
        providerReference: null,
        checkoutUrl: null,
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://pawapay.test/v2/deposits');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.depositId).toBe('gb-tx-1');
      expect(body.amount).toBe('100');
      expect(body.currency).toBe('ZMW');
      expect(body.payer).toMatchObject({
        type: 'MMO',
        accountDetails: {
          phoneNumber: '260763456789',
          provider: 'MTN_MOMO_ZMB',
        },
      });
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer token-de-test',
      );
    });

    it('rejette une réponse REJECTED', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'REJECTED',
          failureReason: {
            failureCode: 'PAYER_NOT_FOUND',
            failureMessage: 'Payer not found',
          },
        }),
      );

      await expect(
        driver().initialize({
          idempotencyKey: 'gb-tx-2',
          orderNumber: 'GB-1',
          amountMinor: 100,
          currency: 'ZMW',
          customerEmail: 'a@example.test',
          returnUrl: 'https://gebook.test/x',
          customerPhone: '260763456789',
          channel: 'MTN_MOMO_ZMB',
        }),
      ).rejects.toThrow();
    });
  });

  describe('verify', () => {
    it('traduit COMPLETED en succès avec le montant en unités mineures', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { depositId: 'gb-tx-1', status: 'COMPLETED', amount: '100' },
        }),
      );

      const result = await driver().verify('gb-tx-1');

      expect(result.outcome).toBe('successful');
      expect(result.paidAmountMinor).toBe(10000);
    });

    it('traduit FAILED en échec sans montant payé', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { depositId: 'gb-tx-1', status: 'FAILED', amount: '100' },
        }),
      );

      const result = await driver().verify('gb-tx-1');

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

    it('refuse une notification sans depositId identifiable', async () => {
      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ amount: '100' }), 'utf8'),
        {},
      );
      expect(parsed).toMatchObject({ signatureValid: false });
    });

    it('accepte une notification dont le dépôt est vérifié COMPLETED, quel que soit le statut prétendu dans le corps', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { depositId: 'gb-tx-1', status: 'COMPLETED', amount: '100' },
        }),
      );

      // Le corps prétend FAILED : n'a aucune importance, seul le rappel authentifié compte.
      const parsed = await driver().parseWebhook(
        Buffer.from(
          JSON.stringify({ depositId: 'gb-tx-1', status: 'FAILED' }),
          'utf8',
        ),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        transactionId: 'gb-tx-1',
        outcome: 'successful',
        paidAmountMinor: 10000,
        paymentMethod: 'mobile_money',
      });
    });

    it('refuse une notification dont la vérification renvoie PROCESSING', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { depositId: 'gb-tx-1', status: 'PROCESSING' },
        }),
      );

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ depositId: 'gb-tx-1' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({ signatureValid: false });
    });
  });

  describe('refund', () => {
    it('rejette explicitement : aucune API de remboursement vérifiée pour ce pilote', async () => {
      await expect(driver().refund()).rejects.toThrow();
    });
  });

  describe('testConnection', () => {
    it('confirme la connexion quand une transaction inexistante répond NOT_FOUND', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'NOT_FOUND' }));

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
