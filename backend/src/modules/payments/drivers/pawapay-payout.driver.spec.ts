import { PawaPayPayoutDriver } from './pawapay-payout.driver';
import { fakeProviderConfig } from './test-support/fake-provider-config';

const ENV: Record<string, string> = {
  PAWAPAY_API_URL: 'https://pawapay.test',
  PAWAPAY_API_TOKEN: 'token-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): PawaPayPayoutDriver {
  return new PawaPayPayoutDriver(fakeProviderConfig(env));
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('PawaPayPayoutDriver', () => {
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
          currency: 'ZMW',
          beneficiaryName: 'John Ecrit',
          beneficiaryCountry: 'ZM',
          beneficiaryAccount: '260763456789',
          method: 'mobile_money',
        }),
      ).rejects.toThrow();
    });

    it('envoie le reversement vers /v2/payouts avec le montant en unités majeures', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ payoutId: 'payout-ref-abc', status: 'ACCEPTED' }),
        );

      const result = await driver().initiate({
        idempotencyKey: 'gb-payout-1',
        payoutReference: 'payout-id-1',
        amountMinor: 10000,
        currency: 'ZMW',
        beneficiaryName: 'John Ecrit',
        beneficiaryCountry: 'ZM',
        beneficiaryAccount: '260763456789',
        method: 'mobile_money',
        channel: 'MTN_MOMO_ZMB',
      });

      expect(result).toMatchObject({
        providerTransactionId: 'payout-ref-abc',
        providerReference: null,
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://pawapay.test/v2/payouts');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.payoutId).toBe('gb-payout-1');
      expect(body.amount).toBe('100');
      expect(body.recipient).toMatchObject({
        type: 'MMO',
        accountDetails: {
          phoneNumber: '260763456789',
          provider: 'MTN_MOMO_ZMB',
        },
      });
    });

    it('rejette une réponse REJECTED', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ status: 'REJECTED' }));

      await expect(
        driver().initiate({
          idempotencyKey: 'gb-payout-2',
          payoutReference: 'payout-id-2',
          amountMinor: 100,
          currency: 'ZMW',
          beneficiaryName: 'John Ecrit',
          beneficiaryCountry: 'ZM',
          beneficiaryAccount: '260763456789',
          method: 'mobile_money',
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
          data: {
            payoutId: 'payout-ref-abc',
            status: 'COMPLETED',
            amount: '100',
          },
        }),
      );

      const result = await driver().verify('payout-ref-abc');

      expect(result.outcome).toBe('successful');
      expect(result.paidAmountMinor).toBe(10000);
    });

    it('renvoie pending honnêtement plutôt que de fabriquer une issue', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { payoutId: 'payout-ref-abc', status: 'PROCESSING' },
        }),
      );

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

    it('accepte une notification dont le reversement est vérifié COMPLETED, quel que soit le statut prétendu dans le corps', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: {
            payoutId: 'payout-ref-abc',
            status: 'COMPLETED',
            amount: '100',
          },
        }),
      );

      const parsed = await driver().parseWebhook(
        Buffer.from(
          JSON.stringify({ payoutId: 'payout-ref-abc', status: 'FAILED' }),
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

    it('accepte une vérification ENQUEUED avec outcome pending, sans la fabriquer en issue définitive', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: { payoutId: 'payout-ref-abc', status: 'ENQUEUED' },
        }),
      );

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ payoutId: 'payout-ref-abc' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({
        signatureValid: true,
        outcome: 'pending',
        paidAmountMinor: 0,
      });
    });

    it('refuse une vérification dont le statut est totalement inconnu', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          status: 'FOUND',
          data: {
            payoutId: 'payout-ref-abc',
            status: 'SOMETHING_UNDOCUMENTED',
          },
        }),
      );

      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ payoutId: 'payout-ref-abc' }), 'utf8'),
        {},
      );

      expect(parsed).toMatchObject({ signatureValid: false });
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
