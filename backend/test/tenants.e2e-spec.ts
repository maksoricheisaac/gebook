import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { ACTIVE_TENANT_COOKIE_NAME } from './../src/modules/tenants/active-tenant-cookie';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminPrismaProxy } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase5.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Support backend du `TenantContext` frontend (Phase 5) : mémberships,
 * activation validée contre les memberships réels, jamais une confiance dans
 * ce que le client envoie.
 */
describe('Tenants — support TenantContext (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let tenantAId: string;
  let tenantBId: string;

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

    await adminPrisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    agent = request.agent(app.getHttpServer());
    const email = `membre-${RUN_ID}${EMAIL_DOMAIN}`;
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Phase',
        lastName: 'Cinq',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { email } });

    const tenantA = await adminPrisma.tenant.create({
      data: {
        slug: `phase5-tenant-a-${RUN_ID}`,
        name: 'Tenant A Phase 5',
        type: 'independent_author',
        status: 'active',
        createdBy: user.id,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await adminPrisma.tenant.create({
      data: {
        slug: `phase5-tenant-b-${RUN_ID}`,
        name: 'Tenant B Phase 5',
        type: 'independent_author',
        status: 'active',
        createdBy: user.id,
      },
    });
    tenantBId = tenantB.id;

    // Le membre appartient à A, pas à B — B sert à vérifier le refus.
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: user.id,
        role: 'owner',
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    await adminPrisma.tenantMember.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await adminPrisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await adminPrisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  it('refuse un visiteur non authentifié', async () => {
    await request(app.getHttpServer()).get('/tenants/me').expect(401);
  });

  it("liste les appartenances réelles de l'utilisateur, et rien d'autre", async () => {
    const response = await agent.get('/tenants/me').expect(200);
    const body = response.body as Array<{ tenantId: string; role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].tenantId).toBe(tenantAId);
    expect(body[0].role).toBe('owner');
  });

  it('active un tenant dont on est réellement membre, et pose le cookie indicatif', async () => {
    const response = await agent
      .post('/tenants/me/active')
      .set('Origin', ORIGIN)
      .send({ tenantId: tenantAId })
      .expect(200);

    const body = response.body as { tenantId: string };
    expect(body.tenantId).toBe(tenantAId);

    const setCookie = response.headers['set-cookie'];
    expect(
      Array.isArray(setCookie) &&
        setCookie.some((c: string) => c.startsWith(ACTIVE_TENANT_COOKIE_NAME)),
    ).toBe(true);
  });

  it("refuse d'activer un tenant dont on n'est PAS membre — jamais une confiance dans ce que le client envoie", async () => {
    await agent
      .post('/tenants/me/active')
      .set('Origin', ORIGIN)
      .send({ tenantId: tenantBId })
      .expect(403);
  });

  it('refuse un identifiant de tenant qui n’existe pas du tout', async () => {
    await agent
      .post('/tenants/me/active')
      .set('Origin', ORIGIN)
      .send({ tenantId: '00000000-0000-7000-8000-000000000000' })
      .expect(403);
  });

  it(
    'un compte ordinaire crée son propre espace en libre-service et en devient owner ' +
      '(la ligne `tenant_members` du créateur passe par une policy dédiée, faute de quoi ' +
      'personne ne peut encore être owner/admin du tenant qui vient de naître)',
    async () => {
      const response = await agent
        .post('/tenants')
        .set('Origin', ORIGIN)
        .send({
          name: `Espace libre-service ${RUN_ID}`,
          slug: `phase5-self-service-${RUN_ID}`,
          type: 'independent_author',
          acceptTerms: true,
        })
        .expect(201);

      const body = response.body as {
        tenantId: string;
        role: string;
        status: string;
      };
      expect(body.role).toBe('owner');
      expect(body.status).toBe('active');

      const setCookie = response.headers['set-cookie'];
      expect(
        Array.isArray(setCookie) &&
          setCookie.some((c: string) =>
            c.startsWith(ACTIVE_TENANT_COOKIE_NAME),
          ),
      ).toBe(true);

      const memberships = await agent.get('/tenants/me').expect(200);
      const tenantIds = (memberships.body as Array<{ tenantId: string }>).map(
        (m) => m.tenantId,
      );
      expect(tenantIds).toContain(body.tenantId);

      await adminPrisma.tenantMember.deleteMany({
        where: { tenantId: body.tenantId },
      });
      await adminPrisma.tenant.delete({ where: { id: body.tenantId } });
    },
  );
});
