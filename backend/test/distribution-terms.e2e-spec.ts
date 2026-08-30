import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminPrismaProxy } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@distributionterms.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Conditions de distribution (mission plateforme de paiement, Phase 3, §16-19) :
 * versionnage Superadmin, et acceptation réellement enregistrée à la création
 * d'un tenant — pas seulement affichée, jamais découverte après une vente.
 */
describe('Conditions de distribution (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<string> => {
    const response = await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'DistributionTerms',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    return (response.body as { id: string }).id;
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
    adminPrisma = adminPrismaProxy(prisma);

    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    adminAgent = request.agent(app.getHttpServer());
    readerAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAgent, `lecteur${EMAIL_DOMAIN}`);

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
    await adminPrisma.tenantTermsAcceptance.deleteMany({
      where: { tenant: { slug: { startsWith: `dt-${RUN_ID}` } } },
    });
    await adminPrisma.tenantMember.deleteMany({
      where: { tenant: { slug: { startsWith: `dt-${RUN_ID}` } } },
    });
    await adminPrisma.tenant.deleteMany({
      where: { slug: { startsWith: `dt-${RUN_ID}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  it('refuse un lecteur sur les routes d’administration', async () => {
    await readerAgent.get('/admin/distribution-terms').expect(403);
    await readerAgent
      .post('/admin/distribution-terms')
      .set('Origin', ORIGIN)
      .send({
        tenantType: 'collective',
        title: 'Tentative',
        content: 'Contenu',
      })
      .expect(403);
  });

  it('un lecteur authentifié peut lire la version en vigueur (avant d’accepter)', async () => {
    const response = await readerAgent
      .get('/distribution-terms/independent_author')
      .expect(200);
    const body = response.body as { tenantType: string; isActive: boolean };
    expect(body.tenantType).toBe('independent_author');
    expect(body.isActive).toBe(true);
  });

  it('publie une nouvelle version, désactive l’ancienne, et audite l’action', async () => {
    const before = await adminAgent
      .get('/distribution-terms/collective')
      .expect(200);
    const beforeBody = before.body as { id: string; version: number };

    const published = await adminAgent
      .post('/admin/distribution-terms')
      .set('Origin', ORIGIN)
      .send({
        tenantType: 'collective',
        title: `Conditions collectif ${RUN_ID}`,
        content: `Contenu de test ${RUN_ID}`,
      })
      .expect(201);
    const publishedBody = published.body as {
      id: string;
      version: number;
      isActive: boolean;
    };
    expect(publishedBody.version).toBe(beforeBody.version + 1);
    expect(publishedBody.isActive).toBe(true);

    // L'ancienne version n'est plus active, mais reste en base (jamais
    // supprimée — brief §18 : l'histoire des versions ne se réécrit pas).
    const oldVersion = await adminPrisma.distributionTerms.findUniqueOrThrow({
      where: { id: beforeBody.id },
    });
    expect(oldVersion.isActive).toBe(false);

    const now = await adminAgent
      .get('/distribution-terms/collective')
      .expect(200);
    expect((now.body as { id: string }).id).toBe(publishedBody.id);

    const log = await adminPrisma.activityLog.findFirst({
      where: {
        action: 'admin.distribution-terms.publish',
        entityId: publishedBody.id,
      },
    });
    expect(log).not.toBeNull();
  });

  it(
    'enregistre réellement l’acceptation à la création d’un tenant, liée à la ' +
      'version en vigueur à cet instant',
    async () => {
      const active = await readerAgent
        .get('/distribution-terms/independent_author')
        .expect(200);
      const activeTermsId = (active.body as { id: string }).id;

      const created = await readerAgent
        .post('/tenants')
        .set('Origin', ORIGIN)
        .send({
          name: `Tenant conditions ${RUN_ID}`,
          slug: `dt-${RUN_ID}-tenant`,
          type: 'independent_author',
          acceptTerms: true,
        })
        .expect(201);
      const tenantId = (created.body as { tenantId: string }).tenantId;

      const acceptance =
        await adminPrisma.tenantTermsAcceptance.findUniqueOrThrow({
          where: { tenantId_termsId: { tenantId, termsId: activeTermsId } },
        });
      expect(acceptance.termsId).toBe(activeTermsId);
      expect(acceptance.acceptedAt).not.toBeNull();
    },
  );

  it('refuse la création d’un tenant sans acceptation explicite', async () => {
    const response = await readerAgent
      .post('/tenants')
      .set('Origin', ORIGIN)
      .send({
        name: `Tenant sans acceptation ${RUN_ID}`,
        slug: `dt-${RUN_ID}-refus`,
        type: 'independent_author',
        acceptTerms: false,
      })
      .expect(400);

    const body = response.body as { errors: Record<string, string[]> };
    expect(body.errors.acceptTerms?.[0]).toContain(
      'conditions de distribution',
    );
  });
});
