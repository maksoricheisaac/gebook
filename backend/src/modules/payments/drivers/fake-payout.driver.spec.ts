import type { ConfigService } from '@nestjs/config';
import type { PayoutWebhookParseResult } from '../payout-driver';
import {
  FakePayoutDriver,
  PAYOUT_SIGNATURE_HEADER,
  PAYOUT_TIMESTAMP_HEADER,
} from './fake-payout.driver';

const SECRET = 'secret-de-test-suffisamment-long-pour-passer';

function driver(): FakePayoutDriver {
  const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
  return new FakePayoutDriver(config);
}

function body(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      eventId: 'evt_payout_1',
      eventType: 'payout.successful',
      transactionId: 'fake_payout_tx_1',
      status: 'successful',
      amountMinor: 900000,
      ...overrides,
    }),
    'utf8',
  );
}

function reasonOf(parsed: PayoutWebhookParseResult): string {
  return parsed.signatureValid ? '' : parsed.reason;
}

describe('FakePayoutDriver', () => {
  const fake = driver();

  it('accepte une notification correctement signée', async () => {
    const rawBody = body();

    const parsed = await fake.parseWebhook(rawBody, fake.signWebhook(rawBody));

    expect(parsed).toMatchObject({
      signatureValid: true,
      eventId: 'evt_payout_1',
      transactionId: 'fake_payout_tx_1',
      outcome: 'successful',
      paidAmountMinor: 900000,
    });
  });

  it('refuse une notification sans signature', async () => {
    const rawBody = body();

    expect(
      await fake.parseWebhook(rawBody, {
        [PAYOUT_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
      }),
    ).toMatchObject({ signatureValid: false });
  });

  it('refuse une signature falsifiée', async () => {
    const rawBody = body();
    const headers = fake.signWebhook(rawBody);

    expect(
      await fake.parseWebhook(rawBody, {
        ...headers,
        [PAYOUT_SIGNATURE_HEADER]: 'f'.repeat(64),
      }),
    ).toMatchObject({ signatureValid: false });
  });

  it('refuse un corps modifié après signature', async () => {
    const signed = body();
    const headers = fake.signWebhook(signed);
    const tampered = body({ amountMinor: 1 });

    expect(await fake.parseWebhook(tampered, headers)).toMatchObject({
      signatureValid: false,
    });
  });

  it('refuse un rejeu hors de la fenêtre de tolérance', async () => {
    const rawBody = body();
    const old = Math.floor(Date.now() / 1000) - 600;

    const parsed = await fake.parseWebhook(
      rawBody,
      fake.signWebhook(rawBody, old),
    );

    expect(parsed.signatureValid).toBe(false);
    expect(reasonOf(parsed)).toContain('rejeu');
  });

  it('refuse un corps illisible sans lever d’exception', async () => {
    const rawBody = Buffer.from('ceci n’est pas du JSON', 'utf8');

    expect(
      await fake.parseWebhook(rawBody, fake.signWebhook(rawBody)),
    ).toMatchObject({ signatureValid: false });
  });

  it('refuse une notification signée mais incomplète', async () => {
    const rawBody = body({ transactionId: undefined });

    const parsed = await fake.parseWebhook(rawBody, fake.signWebhook(rawBody));

    expect(parsed.signatureValid).toBe(false);
    expect(reasonOf(parsed)).toContain('incomplète');
  });

  it('sait simuler un échec et un état encore en attente', async () => {
    for (const status of ['failed', 'pending']) {
      const rawBody = body({ status });

      expect(
        await fake.parseWebhook(rawBody, fake.signWebhook(rawBody)),
      ).toMatchObject({
        signatureValid: true,
        outcome: status,
      });
    }
  });

  it('ouvre une demande de reversement avec un identifiant propre au prestataire', async () => {
    const initiated = await fake.initiate({
      idempotencyKey: 'cle',
      payoutReference: 'payout-id-1',
      amountMinor: 900000,
      currency: 'XAF',
      beneficiaryName: 'John Ecrit',
      beneficiaryCountry: 'CG',
      beneficiaryAccount: '+242060000000',
      method: 'mobile_money',
    });

    expect(initiated.providerTransactionId).toMatch(/^fake_payout_/);
    expect(initiated.providerReference).toBe('payout-id-1');
  });
});
