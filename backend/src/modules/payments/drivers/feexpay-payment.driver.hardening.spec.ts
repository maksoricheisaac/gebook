/**
 * Tests MOCKÉS : aucun appel réel à FeexPay (aucune boutique sandbox utilisable
 * à ce jour). Les réponses ci-dessous sont des simulations, pas la preuve d'un
 * paiement de bout en bout.
 */
import { Logger } from '@nestjs/common';
import {
  InvalidProviderResponse,
  isUncertainProviderError,
  PaymentRejectedByProvider,
  ProviderTimeout,
  ProviderUnavailable,
} from '../provider-errors';
import { FeexPayPaymentDriver } from './feexpay-payment.driver';
import { fakeProviderConfig } from './test-support/fake-provider-config';

const ENV: Record<string, string> = {
  FEEXPAY_API_URL: 'https://feexpay.test',
  FEEXPAY_API_KEY: 'cle-factice-de-test',
  FEEXPAY_SHOP_ID: 'shop-factice',
};

const driver = (env: Record<string, string | undefined> = ENV) =>
  new FeexPayPaymentDriver(fakeProviderConfig(env));

const response = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

const request = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: 'gb-tx-1',
  orderNumber: 'GB-1',
  amountMinor: 500000,
  currency: 'XAF',
  customerEmail: 'a@example.test',
  returnUrl: 'https://gebook.test/x',
  customerPhone: '242061234567',
  channel: 'mtn_cg',
  ...overrides,
});

describe('FeexPayPaymentDriver (mocké) — durcissement', () => {
  let fetchSpy: jest.SpyInstance;
  afterEach(() => fetchSpy?.mockRestore());

  describe('validation avant appel réseau', () => {
    it.each([
      ['montant < 100', 9900],
      ['montant > 2 000 000', 200000100],
      ['montant décimal', 10050],
    ])('refuse %s sans appeler FeexPay', async (_label, amountMinor) => {
      fetchSpy = jest.spyOn(global, 'fetch');
      await expect(
        driver().initialize(request({ amountMinor })),
      ).rejects.toMatchObject({ code: 'ERR_INVALID_AMOUNT' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('accepte les bornes 100 et 2 000 000', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ reference: 'mock-reference' }));
      await driver().initialize(request({ amountMinor: 10000 }));
      await driver().initialize(request({ amountMinor: 200000000 }));
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('refuse un numéro local ou hors format Congo', async () => {
      fetchSpy = jest.spyOn(global, 'fetch');
      for (const customerPhone of ['061234567', '24206123', undefined]) {
        await expect(
          driver().initialize(request({ customerPhone })),
        ).rejects.toMatchObject({ code: 'ERR_INVALID_PHONE_NUMBER' });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('normalise +242 06 123 45 67 avant envoi', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ reference: 'mock-reference' }));
      await driver().initialize(
        request({ customerPhone: '+242 06 123 45 67' }),
      );
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(
        (JSON.parse(init.body as string) as { phoneNumber: string })
          .phoneNumber,
      ).toBe('242061234567');
    });

    it('refuse une devise inconnue', async () => {
      await expect(
        driver().initialize(request({ currency: 'EUR' })),
      ).rejects.toMatchObject({ code: 'ERR_INVALID_AMOUNT' });
    });

    it('échoue sans boutique configurée (missing shop)', async () => {
      fetchSpy = jest.spyOn(global, 'fetch');
      await expect(
        driver({ ...ENV, FEEXPAY_SHOP_ID: undefined }).initialize(request()),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('utilise le canal par défaut FEEXPAY_NETWORK', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ reference: 'mock-reference' }));
      await driver({ ...ENV, FEEXPAY_NETWORK: 'mtn_cg' }).initialize(
        request({ channel: undefined }),
      );
      expect((fetchSpy.mock.calls[0] as [string])[0]).toContain('/mtn_cg');
    });
  });

  describe('classification des erreurs HTTP (mockées)', () => {
    it.each([
      [401, {}, 'ERR_INVALID_API_KEY'],
      [403, { code: 'IP_NOT_ALLOWED' }, 'ERR_IP_NOT_AUTHORIZED'],
      [403, { code: 'ACCESS_DENIED' }, 'ERR_ACCESS_DENIED'],
      [403, {}, 'ERR_ACCESS_DENIED'],
      [429, { code: 'RATE_LIMIT_EXCEEDED' }, 'RATE_LIMIT_EXCEEDED'],
      [404, { message: 'mtn_cg channel not configured' }, 'NOT_FOUND'],
      [400, { code: 'MISSING_REFERENCE' }, 'MISSING_REFERENCE'],
      [400, { code: 'ERR_INVALID_PHONE_NUMBER' }, 'ERR_INVALID_PHONE_NUMBER'],
      [400, { code: 'ERR_INSUFFICIENT_BALANCE' }, 'ERR_INSUFFICIENT_BALANCE'],
      [503, { code: 'NETWORK_UNAVAILABLE' }, 'ERR_NETWORK_UNAVAILABLE'],
    ])('HTTP %s %j → %s (refus définitif)', async (status, body, code) => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response(body, status));
      const error = await driver()
        .initialize(request())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PaymentRejectedByProvider);
      expect((error as PaymentRejectedByProvider).code).toBe(code);
      expect(isUncertainProviderError(error)).toBe(false);
    });

    it('HTTP 500 / 502 : issue incertaine, jamais un échec', async () => {
      for (const status of [500, 502]) {
        fetchSpy?.mockRestore();
        fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue(response({}, status));
        const error = await driver()
          .initialize(request())
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ProviderUnavailable);
        expect(isUncertainProviderError(error)).toBe(true);
      }
    });

    it('timeout : issue incertaine, sans retry', async () => {
      const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
      fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(abort);
      const error = await driver()
        .initialize(request())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ProviderTimeout);
      expect(isUncertainProviderError(error)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('erreur réseau/DNS : issue incertaine, sans retry', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND'));
      const error = await driver()
        .initialize(request())
        .catch((e: unknown) => e);
      expect(isUncertainProviderError(error)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('HTTP 200 avec success:false n’est pas un succès', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          response({ success: false, code: 'ERR_INVALID_AMOUNT' }),
        );
      await expect(driver().initialize(request())).rejects.toMatchObject({
        code: 'ERR_INVALID_AMOUNT',
      });
    });

    it('doublon : issue incertaine (ni échec, ni relance)', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          response({ code: 'ERR_DUPLICATE_TRANSACTION' }, 400),
        );
      const error = await driver()
        .initialize(request())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidProviderResponse);
      expect(isUncertainProviderError(error)).toBe(true);
    });
  });

  describe('statut', () => {
    it.each([
      ['PENDING', 'pending'],
      ['SUCCESSFUL', 'successful'],
      ['FAILED', 'failed'],
      ['STATUT_INCONNU', 'pending'],
    ])(
      '%s → %s (PENDING n’est jamais un échec ni un succès)',
      async (status, outcome) => {
        fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue(
            response({ reference: 'mock-reference', status, amount: 5000 }),
          );
        const result = await driver().verify('mock-reference');
        expect(result.outcome).toBe(outcome);
        expect(result.paidAmountMinor).toBe(
          outcome === 'successful' ? 500000 : 0,
        );
      },
    );

    it('NOT_FOUND : refus explicite, pas d’issue inventée', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ message: 'not found' }, 404));
      await expect(driver().verify('inconnue')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('secrets', () => {
    it('ne divulgue ni la clé, ni le téléphone, ni le corps brut', async () => {
      const logged: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug'] as const).map((method) =>
        jest
          .spyOn(Logger.prototype, method)
          .mockImplementation((...args: unknown[]) => {
            logged.push(String(args[0]));
          }),
      );
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ message: 'secret interne' }, 401));

      const error = (await driver()
        .initialize(request())
        .catch((e: unknown) => e)) as PaymentRejectedByProvider;
      spies.forEach((spy) => spy.mockRestore());

      const everything = [error.message, error.userMessage, ...logged].join(
        '\n',
      );
      expect(everything).not.toContain('cle-factice-de-test');
      expect(everything).not.toContain('Bearer');
      expect(everything).not.toContain('242061234567');
      expect(everything).not.toContain('secret interne');
    });

    it('masque le téléphone dans le log d’initiation', async () => {
      const logged: string[] = [];
      const spy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((...args: unknown[]) => {
          logged.push(String(args[0]));
        });
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          response({ reference: 'mock-reference', status: 'PENDING' }),
        );
      await driver().initialize(request());
      spy.mockRestore();

      expect(logged.join('\n')).toContain('242******567');
      expect(logged.join('\n')).not.toContain('242061234567');
    });
  });
});
