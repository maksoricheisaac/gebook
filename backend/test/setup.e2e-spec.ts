import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { PrismaService } from './../src/prisma/prisma.service';
import type { AuthUserResponse } from './../src/modules/auth/dto/auth-user.response';
import type { ErrorResponseBody } from './../src/common/filters/http-exception.filter';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase5-setup.e2e.test';
// Doit correspondre à `SETUP_TOKEN` en environnement de test (défaut de développement
// si la variable n'est pas surchargée — voir `src/config/environment.ts`).
const SETUP_TOKEN =
  process.env.SETUP_TOKEN ?? 'jeton-de-developpement-gebook-a-remplacer';

/**
 * Ces tests s'exécutent sur la base réellement migrée par `prisma/seed.ts`. Contrairement
 * à `auth.e2e-spec.ts`, ils ne peuvent pas nettoyer d'état avant de commencer : l'invariant
 * vérifié ici — au plus un superadmin peut jamais être créé par cette route — est justement
 * celui qui interdit de repartir d'une base « sans superadmin » à volonté. La suite observe
 * donc l'état réel (`GET /setup/status`) et adapte ce qu'elle vérifie, plutôt que de risquer
 * de perturber un superadmin déjà en place sur l'environnement où elle tourne.
 */
describe('Configuration initiale (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

    await prisma.loginAttempt.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.loginAttempt.deleteMany({});
    await app.close();
  });

  const superadminPayload = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    token: SETUP_TOKEN,
    firstName: 'Riche',
    lastName: 'Makso',
    email: `riche.setup${EMAIL_DOMAIN}`,
    password: 'MotDePasse1',
    passwordConfirmation: 'MotDePasse1',
    ...overrides,
  });

  it('refuse une écriture sans origine autorisée', async () => {
    await request(app.getHttpServer())
      .post('/setup/superadmin')
      .send(superadminPayload())
      .expect(403);
  });

  it('refuse un jeton invalide — ou signale que la route est déjà fermée si un superadmin existe', async () => {
    const before = await request(app.getHttpServer()).get('/setup/status');
    const completed = (before.body as { completed: boolean }).completed;

    const response = await request(app.getHttpServer())
      .post('/setup/superadmin')
      .set('Origin', ORIGIN)
      .send(superadminPayload({ token: 'jeton-incorrect' }))
      .expect(completed ? 403 : 401);

    expect((response.body as ErrorResponseBody).message).toBe(
      completed
        ? 'La configuration initiale a déjà été effectuée.'
        : 'Jeton de configuration invalide.',
    );
  });

  it('refuse une confirmation de mot de passe différente — ou signale que la route est déjà fermée', async () => {
    const before = await request(app.getHttpServer()).get('/setup/status');
    const completed = (before.body as { completed: boolean }).completed;

    const response = await request(app.getHttpServer())
      .post('/setup/superadmin')
      .set('Origin', ORIGIN)
      .send(superadminPayload({ passwordConfirmation: 'AutreMotDePasse1' }))
      .expect(completed ? 403 : 400);

    if (!completed) {
      expect(
        (response.body as ErrorResponseBody).errors?.passwordConfirmation,
      ).toBeDefined();
    }
  });

  describe('GET /setup/status', () => {
    it('répond par un booléen, sans authentification', async () => {
      const response = await request(app.getHttpServer())
        .get('/setup/status')
        .expect(200);

      expect(typeof (response.body as { completed: unknown }).completed).toBe(
        'boolean',
      );
    });
  });

  describe('selon l’état réel de la configuration', () => {
    it('crée le superadmin la première fois, puis ferme la route pour toujours', async () => {
      const before = await request(app.getHttpServer()).get('/setup/status');

      if ((before.body as { completed: boolean }).completed) {
        // Un superadmin existe déjà sur cet environnement (dev partagé, run
        // précédent…) : vérifier seulement que la route reste bien fermée.
        const response = await request(app.getHttpServer())
          .post('/setup/superadmin')
          .set('Origin', ORIGIN)
          .send(superadminPayload())
          .expect(403);

        expect((response.body as ErrorResponseBody).message).toContain(
          'déjà été effectuée',
        );
        return;
      }

      const created = await request(app.getHttpServer())
        .post('/setup/superadmin')
        .set('Origin', ORIGIN)
        .send(superadminPayload())
        .expect(201);

      const body = created.body as AuthUserResponse;
      expect(body.roles).toEqual(['admin']);
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash/i);

      const setCookie = created.headers['set-cookie'];
      expect(setCookie?.[0]).toMatch(/gebook_session=.+HttpOnly/);

      const status = await request(app.getHttpServer()).get('/setup/status');
      expect((status.body as { completed: boolean }).completed).toBe(true);

      // Même avec le bon jeton, la route est maintenant fermée.
      await request(app.getHttpServer())
        .post('/setup/superadmin')
        .set('Origin', ORIGIN)
        .send(superadminPayload({ email: `second${EMAIL_DOMAIN}` }))
        .expect(403);
    });
  });
});
