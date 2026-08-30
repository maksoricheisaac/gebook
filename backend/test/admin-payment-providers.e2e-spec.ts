import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { PrismaService } from './../src/prisma/prisma.service';

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
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    await adminAgent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: adminEmail, password: 'MotDePasse1' })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
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
    // un secret ne peut s'y glisser sans que ce test échoue (`missingEnvVars`
    // ne contient que des NOMS de variable, jamais une valeur).
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
      'missingEnvVars',
    ]);
    for (const provider of providers) {
      expect(new Set(Object.keys(provider))).toEqual(EXPECTED_KEYS);
    }

    const fake = providers.find((p) => p.code === 'fake');
    expect(fake).toMatchObject({
      status: 'active',
      environment: 'sandbox',
      payinDriverInstalled: true,
      payoutDriverInstalled: true,
      configured: true,
      missingEnvVars: [],
    });

    const pawapay = providers.find((p) => p.code === 'pawapay');
    expect(pawapay).toMatchObject({
      status: 'inactive',
      payinDriverInstalled: false,
      payoutDriverInstalled: false,
      // Aucune clé PawaPay fournie dans cet environnement de test.
      configured: false,
    });
    expect(pawapay?.missingEnvVars).toEqual(
      expect.arrayContaining(['PAWAPAY_API_URL', 'PAWAPAY_API_TOKEN']),
    );
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
      .post('/admin/payment-providers/pawapay/test-connection')
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
});
