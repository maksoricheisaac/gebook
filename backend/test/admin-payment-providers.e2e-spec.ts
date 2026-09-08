import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { MailService } from './../src/modules/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { fakeMailService } from './support/fake-mail';
import { verifyAndLogin } from './support/verify-and-login';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@paymentproviders.e2e.test';

/**
 * Superadmin → Paramètres → Paiements (Phase 2). Vérifie ce que le brief exige
 * explicitement : jamais de secret exposé, sandbox/production visible, un vrai
 * test de connectivité (pas fabriqué) pour un prestataire sans pilote installé.
 */
describe('Superadmin — Prestataires de paiement (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'PaymentProviders',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    await verifyAndLogin(agent, prisma, ORIGIN, email, mail.sent);
  };

  const mail = fakeMailService();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    adminAgent = request.agent(app.getHttpServer());
    readerAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    const readerEmail = `lecteur${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAgent, readerEmail);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    // Les tests « configuration »/« default » ci-dessous écrivent dans la
    // base de développement partagée (pas de base e2e isolée pour cette
    // suite) : on efface ce qu'ils y ont laissé pour que la suite reste
    // rejouable sans dérive d'un run à l'autre.
    await prisma.paymentProviderCredential.deleteMany({
      where: { provider: { code: 'pawapay' } },
    });
    await prisma.setting
      .update({
        where: { settingKey: 'default_payment_provider' },
        data: { settingValue: 'fake' },
      })
      .catch(() => undefined);
    await app.close();
  });

  it('refuse un lecteur non-admin', async () => {
    await readerAgent
      .get('/admin/payment-providers')
      .set('Origin', ORIGIN)
      .expect(403);
  });

  it('liste les prestataires sans jamais exposer de secret', async () => {
    const response = await adminAgent
      .get('/admin/payment-providers')
      .set('Origin', ORIGIN)
      .expect(200);

    const providers = response.body as Array<Record<string, unknown>>;
    expect(providers.length).toBeGreaterThan(0);

    // Chaque ligne n'expose que ce jeu de champs exact : rien qui ressemble à
    // un secret ne peut s'y glisser sans que ce test échoue (`missingFields`
    // ne contient que des LIBELLÉS, `credentialFields` ne porte que
    // `hasValue`, jamais une valeur).
    const EXPECTED_KEYS = new Set([
      'code',
      'name',
      'environment',
      'status',
      'supportsMobileMoney',
      'supportsCard',
      'supportsRefund',
      'supportsPayout',
      'priority',
      'payinDriverInstalled',
      'payoutDriverInstalled',
      'configured',
      'missingFields',
      'credentialFields',
      'isDefault',
    ]);
    for (const provider of providers) {
      expect(new Set(Object.keys(provider))).toEqual(EXPECTED_KEYS);
      for (const field of provider.credentialFields as Array<
        Record<string, unknown>
      >) {
        expect(new Set(Object.keys(field))).toEqual(
          new Set([
            'key',
            'label',
            'secret',
            'required',
            'envFallback',
            'hasValue',
          ]),
        );
      }
    }

    const fake = providers.find((p) => p.code === 'fake');
    expect(fake).toMatchObject({
      status: 'active',
      environment: 'sandbox',
      payinDriverInstalled: true,
      payoutDriverInstalled: true,
      configured: true,
      missingFields: [],
      credentialFields: [],
    });

    // Un vrai pilote existe désormais (PawaPayPaymentDriver/PawaPayPayoutDriver) :
    // installé, mais toujours incomplet tant qu'aucun identifiant (base ou
    // repli PAWAPAY_API_TOKEN) n'a été fourni dans cet environnement de test.
    const pawapay = providers.find((p) => p.code === 'pawapay');
    expect(pawapay).toMatchObject({
      status: 'active',
      payinDriverInstalled: true,
      payoutDriverInstalled: true,
      configured: false,
    });
    expect(pawapay?.missingFields).toEqual(
      expect.arrayContaining(['Jeton API']),
    );

    // Chariow n'a aucun pilote réel : honnêtement signalé, jamais fabriqué.
    const chariow = providers.find((p) => p.code === 'chariow');
    expect(chariow).toMatchObject({
      status: 'inactive',
      payinDriverInstalled: false,
      credentialFields: [],
    });
  });

  it('teste réellement la connexion du prestataire de simulation', async () => {
    const response = await adminAgent
      .post('/admin/payment-providers/fake/test-connection')
      .set('Origin', ORIGIN)
      .expect(200);

    expect(response.body).toMatchObject({
      code: 'fake',
      payin: { ok: true },
      payout: { ok: true },
    });
  });

  it('rapporte honnêtement l’absence de pilote pour un prestataire non implémenté', async () => {
    const response = await adminAgent
      .post('/admin/payment-providers/chariow/test-connection')
      .set('Origin', ORIGIN)
      .expect(200);

    const body = response.body as {
      payin: { ok: boolean; detail: string };
    };
    expect(body.payin.ok).toBe(false);
    expect(body.payin.detail).toContain('aucun pilote');
  });

  it('renvoie 404 pour un code de prestataire inconnu', async () => {
    await adminAgent
      .post('/admin/payment-providers/does-not-exist/test-connection')
      .set('Origin', ORIGIN)
      .expect(404);
  });

  it('enregistre des identifiants chiffrés sans jamais les renvoyer en clair, et n’efface pas un champ laissé vide', async () => {
    const first = await adminAgent
      .put('/admin/payment-providers/pawapay/configuration')
      .set('Origin', ORIGIN)
      .send({ credentials: { apiToken: 'jeton-de-test-e2e' }, priority: 9 })
      .expect(200);

    expect(JSON.stringify(first.body)).not.toContain('jeton-de-test-e2e');
    expect(first.body).toMatchObject({ configured: true, priority: 9 });

    const stored = await prisma.paymentProviderCredential.findFirstOrThrow({
      where: { provider: { code: 'pawapay' }, key: 'apiToken' },
    });
    expect(stored.valueEncrypted).not.toContain('jeton-de-test-e2e');

    // Un champ absent de la requête suivante doit laisser l'identifiant
    // existant intact — jamais réinitialisé faute d'être jamais réaffiché.
    const second = await adminAgent
      .put('/admin/payment-providers/pawapay/configuration')
      .set('Origin', ORIGIN)
      .send({ priority: 4 })
      .expect(200);

    expect(second.body).toMatchObject({ configured: true, priority: 4 });
  });

  it('désigne un prestataire configuré par défaut, et refuse celui qui ne l’est pas', async () => {
    await adminAgent
      .put('/admin/payment-providers/chariow/default')
      .set('Origin', ORIGIN)
      .expect(400);

    const response = await adminAgent
      .put('/admin/payment-providers/pawapay/default')
      .set('Origin', ORIGIN)
      .expect(200);

    expect(response.body).toMatchObject({ code: 'pawapay', isDefault: true });

    const list = await adminAgent
      .get('/admin/payment-providers')
      .set('Origin', ORIGIN)
      .expect(200);
    const providers = list.body as Array<{ code: string; isDefault: boolean }>;
    expect(providers.find((p) => p.code === 'fake')?.isDefault).toBe(false);
    expect(providers.find((p) => p.code === 'pawapay')?.isDefault).toBe(true);
  });
});
