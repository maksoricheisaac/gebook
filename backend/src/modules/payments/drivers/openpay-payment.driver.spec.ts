import { PaymentRejectedByProvider } from '../provider-errors';
import { OpenPayPaymentDriver } from './openpay-payment.driver';
import { fakeProviderConfig } from './test-support/fake-provider-config';

const ENV: Record<string, string> = {
  OPENPAY_API_URL: 'https://openpay.test',
  OPENPAY_API_KEY: 'apikey-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): OpenPayPaymentDriver {
  return new OpenPayPaymentDriver(fakeProviderConfig(env));
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

const REQUEST = {
  idempotencyKey: 'gb-tx-1',
  orderNumber: 'GB-1',
  amountMinor: 10000,
  currency: 'XAF',
  customerEmail: 'a@example.test',
  returnUrl: 'https://gebook.test/x',
  customerPhone: '242061234567',
  channel: 'mtn',
};

describe('OpenPayPaymentDriver', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('refuse un canal inconnu ou absent', async () => {
    await expect(
      driver().initialize({ ...REQUEST, channel: 'orange' }),
    ).rejects.toBeInstanceOf(PaymentRejectedByProvider);
    await expect(
      driver().initialize({ ...REQUEST, channel: undefined }),
    ).rejects.toBeInstanceOf(PaymentRejectedByProvider);
  });

  it('refuse un numéro hors format 242XXXXXXXXX', async () => {
    await expect(
      driver().initialize({ ...REQUEST, customerPhone: '061234567' }),
    ).rejects.toBeInstanceOf(PaymentRejectedByProvider);
  });

  it('refuse une devise autre que XAF', async () => {
    await expect(
      driver().initialize({ ...REQUEST, currency: 'EUR' }),
    ).rejects.toBeInstanceOf(PaymentRejectedByProvider);
  });

  it('initie le paiement avec la clé XO-API-KEY et l’opérateur en majuscules', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        jsonResponse({ reference: 'PTXN1', status: 'pending' }),
      );

    const result = await driver().initialize(REQUEST);

    expect(result).toMatchObject({
      providerTransactionId: 'PTXN1',
      checkoutUrl: null,
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openpay.test/v1/transaction/payment');
    expect((init.headers as Record<string, string>)['XO-API-KEY']).toBe(
      'apikey-de-test',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      amount: 100,
      payment_phone_number: '242061234567',
      provider: 'MTN',
    });
  });

  it('traite une 5xx comme une issue incertaine', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ error: 'boom' }, false, 502));
    await expect(driver().initialize(REQUEST)).rejects.toMatchObject({
      name: 'ProviderUnavailable',
    });
  });

  describe('verify', () => {
    it.each([
      ['success', 'successful'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
      ['pending', 'pending'],
    ])('traduit %s en %s', async (status, outcome) => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ reference: 'PTXN1', amount: '10000', status }),
        );
      const result = await driver().verify('PTXN1');
      expect(result.outcome).toBe(outcome);
      expect(result.paidAmountMinor).toBe(
        outcome === 'successful' ? result.paidAmountMinor : 0,
      );
    });
  });

  describe('parseWebhook', () => {
    it('ignore le statut du corps et se fie au rappel de statut', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          reference: 'PTXN1',
          amount: '10000',
          status: 'failed',
        }),
      );
      const body = Buffer.from(
        JSON.stringify({ reference: 'PTXN1', status: 'success' }),
      );
      const parsed = await driver().parseWebhook(body, {});
      expect(parsed).toMatchObject({
        signatureValid: true,
        outcome: 'failed',
        paidAmountMinor: 0,
      });
    });

    it('rejette un corps sans référence', async () => {
      const parsed = await driver().parseWebhook(Buffer.from('{}'), {});
      expect(parsed.signatureValid).toBe(false);
    });

    it('rejette si la vérification est indisponible', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('network'));
      const parsed = await driver().parseWebhook(
        Buffer.from(JSON.stringify({ reference: 'PTXN1' })),
        {},
      );
      expect(parsed.signatureValid).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('considère un 404 comme une clé acceptée', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ error: 'not found' }, false, 404));
      expect((await driver().testConnection()).ok).toBe(true);
    });

    it('échoue sur 401', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ error: 'bad key' }, false, 401));
      expect((await driver().testConnection()).ok).toBe(false);
    });
  });
});
