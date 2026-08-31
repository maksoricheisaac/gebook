import type { ConfigService } from '@nestjs/config';
import type { WebhookParseResult } from '../payment-driver';
import {
  FakePaymentDriver,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from './fake-payment.driver';

const SECRET = 'secret-de-test-suffisamment-long-pour-passer';

function driver(): FakePaymentDriver {
  const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
  return new FakePaymentDriver(config);
}

function body(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      eventId: 'evt_1',
      eventType: 'payment.successful',
      transactionId: 'fake_tx_1',
      status: 'successful',
      amountMinor: 1500000,
      feeMinor: 25000,
      paymentMethod: 'mobile_money',
      ...overrides,
    }),
    'utf8',
  );
}

/** Motif de refus, ou chaîne vide si la notification a été acceptée. */
function reasonOf(parsed: WebhookParseResult): string {
  return parsed.signatureValid ? '' : parsed.reason;
}

describe('FakePaymentDriver', () => {
  const fake = driver();

  it('accepte une notification correctement signée', async () => {
    const rawBody = body();

    const parsed = await fake.parseWebhook(rawBody, fake.signWebhook(rawBody));

    expect(parsed).toMatchObject({
      signatureValid: true,
      eventId: 'evt_1',
      transactionId: 'fake_tx_1',
      outcome: 'successful',
      paidAmountMinor: 1500000,
      feeMinor: 25000,
      paymentMethod: 'mobile_money',
    });
  });

  it('refuse une notification sans signature', async () => {
    const rawBody = body();

    expect(
      await fake.parseWebhook(rawBody, {
        [TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
      }),
    ).toMatchObject({ signatureValid: false });
  });

  it('refuse une signature falsifiée', async () => {
    const rawBody = body();
    const headers = fake.signWebhook(rawBody);

    expect(
      await fake.parseWebhook(rawBody, {
        ...headers,
        [SIGNATURE_HEADER]: 'f'.repeat(64),
      }),
    ).toMatchObject({ signatureValid: false });
  });

  /**
   * Le cœur de l'affaire : signer le corps analysé puis réassemblé ne prouverait
   * rien. Modifier le montant après signature doit invalider la notification.
   */
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

  it('refuse une notification dont l’horodatage a été déplacé', async () => {
    // L'horodatage entre dans le calcul de la signature : le décaler pour
    // contourner la fenêtre anti-rejeu invalide donc la signature.
    const rawBody = body();
    const headers = fake.signWebhook(
      rawBody,
      Math.floor(Date.now() / 1000) - 600,
    );

    expect(
      await fake.parseWebhook(rawBody, {
        ...headers,
        [TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
      }),
    ).toMatchObject({ signatureValid: false });
  });

  it('refuse un corps illisible sans lever d’exception', async () => {
    const rawBody = Buffer.from('ceci n’est pas du JSON', 'utf8');

    expect(
      await fake.parseWebhook(rawBody, fake.signWebhook(rawBody)),
    ).toMatchObject({
      signatureValid: false,
    });
  });

  it('refuse une notification signée mais incomplète', async () => {
    const rawBody = body({ transactionId: undefined });

    const parsed = await fake.parseWebhook(rawBody, fake.signWebhook(rawBody));

    expect(parsed.signatureValid).toBe(false);
    expect(reasonOf(parsed)).toContain('incomplète');
  });

  it('sait simuler un échec et une annulation', async () => {
    for (const status of ['failed', 'cancelled']) {
      const rawBody = body({ status });

      expect(
        await fake.parseWebhook(rawBody, fake.signWebhook(rawBody)),
      ).toMatchObject({
        signatureValid: true,
        outcome: status,
      });
    }
  });

  it('ouvre une tentative avec un identifiant de transaction propre au prestataire', async () => {
    const initialized = await fake.initialize({
      idempotencyKey: 'cle',
      orderNumber: 'GB-20260813-ABCDEF',
      amountMinor: 1500000,
      currency: 'XAF',
      customerEmail: 'lecteur@example.test',
      returnUrl: 'http://localhost:3000/paiement/GB-20260813-ABCDEF',
    });

    expect(initialized.providerTransactionId).toMatch(/^fake_tx_/);
    // Aucune page externe : le règlement se simule depuis GeBook.
    expect(initialized.checkoutUrl).toBeNull();
  });
});
