import type { ConfigService } from '@nestjs/config';
import { FeexPayPayoutDriver } from './feexpay-payout.driver';

const ENV: Record<string, string> = {
  FEEXPAY_API_URL: 'https://feexpay.test',
  FEEXPAY_API_KEY: 'apikey-de-test',
  FEEXPAY_SHOP_ID: 'shop-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): FeexPayPayoutDriver {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new FeexPayPayoutDriver(config);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('FeexPayPayoutDriver', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('initiate', () => {
    it('refuse sans canal', async () => {
      await expect(
        driver().initiate({
          idempotencyKey: 'gb-payout-1',
          payoutReference: 'payout-id-1',
          amountMinor: 10000,
          currency: 'XOF',
          beneficiaryName: 'John Ecrit',
          beneficiaryCountry: 'CG',
          beneficiaryAccount: '242676600000000',
          method: 'mobile_money',
        }),
      ).rejects.toThrow();
    });

    it('envoie le montant en unités majeures vers le canal demandé', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ reference: 'payout-ref-abc', status: 'PENDING' }),
        );

      const result = await driver().initiate({
        idempotencyKey: 'gb-payout-1',
        payoutReference: 'payout-id-1',
        amountMinor: 10000,
        currency: 'XOF',
        beneficiaryName: 'John Ecrit',
        beneficiaryCountry: 'CG',
        beneficiaryAccount: '242676600000000',
        method: 'mobile_money',
        channel: 'mtn_cg',
      });

      expect(result).toMatchObject({
        providerTransactionId: 'payout-ref-abc',
        providerReference: 'payout-ref-abc',
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://feexpay.test/api/payouts/public/mtn_cg');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.amount).toBe(100);
      expect(body.phoneNumber).toBe('242676600000000');
      expect(body.shop).toBe('shop-de-test');
      expect(body.motif).toBe('Reversement John Ecrit');
    });

    it('rejette une réponse sans référence', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'rejected' }));

      await expect(
        driver().initiate({
          idempotencyKey: 'gb-payout-2',
          payoutReference: 'payout-id-2',
          amountMinor: 100,
          currency: 'XOF',
          beneficiaryName: 'John Ecrit',
          beneficiaryCountry: 'CG',
          beneficiaryAccount: '242676600000000',
          method: 'mobile_money',
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

      const result = await driver().verify('payout-ref-abc');

      expect(result.outcome).toBe('successful');
      expect(result.paidAmountMinor).toBe(10000);
    });

    it('renvoie pending honnêtement plutôt que de fabriquer une issue', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'PENDING' }));

      const result = await driver().verify('payout-ref-abc');

      expect(result.outcome).toBe('pending');
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

    it('accepte une notification dont la référence est vérifiée SUCCESSFUL, quel que soit le statut prétendu dans le corps', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'SUCCESSFUL', amount: 100 }));

      const parsed = await driver().parseWebhook(
        Buffer.from(
          JSON.stringify({ reference: 'payout-ref-abc', status: 'FAILED' }),
          'utf8',
        ),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        transactionId: 'payout-ref-abc',
        outcome: 'successful',
        paidAmountMinor: 10000,
      });
    });

    it('accepte une vérification PENDING avec outcome pending, sans la fabriquer en issue définitive', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'PENDING' }));

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ reference: 'payout-ref-abc' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        outcome: 'pending',
        paidAmountMinor: 0,
      });
    });

    it('refuse une vérification dont le statut est totalement inconnu', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'SOMETHING_UNDOCUMENTED' }));

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ reference: 'payout-ref-abc' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({ signatureValid: false });
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
