import type { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

function configWithSecret(secret: string): ConfigService {
  return { getOrThrow: () => secret } as unknown as ConfigService;
}

describe('TurnstileService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('accepte un jeton que Cloudflare valide', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }) as never;
    const service = new TurnstileService(configWithSecret('secret'));

    await expect(service.verify('jeton', '203.0.113.1')).resolves.toBe(true);
  });

  it('refuse un jeton que Cloudflare rejette', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
    }) as never;
    const service = new TurnstileService(configWithSecret('secret'));

    await expect(service.verify('jeton', '203.0.113.1')).resolves.toBe(false);
  });

  it('refuse (fail-closed) si Cloudflare est injoignable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('réseau indisponible')) as never;
    const service = new TurnstileService(configWithSecret('secret'));

    await expect(service.verify('jeton', '203.0.113.1')).resolves.toBe(false);
  });
});
