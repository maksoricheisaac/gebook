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
import type { ErrorResponseBody } from './../src/common/filters/http-exception.filter';
import { adminPrismaProxy } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@tenant-authors.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Preuve end-to-end que `TenantAccessGuard` + `TenantContextService` ouvrent
 * réellement `/admin/authors` aux membres de tenant (brief §7), sans jamais
 * laisser un tenant en toucher un autre — au niveau HTTP, pas seulement au
 * niveau RLS déjà couvert par `multi-tenant-rls.e2e-spec.ts`.
 */
describe('Back-office Auteurs — accès par tenant (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;

  let tenantAId: string;
  let tenantBId: string;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<string> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Tenant',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    return user.id;
  };

  const activate = async (
    agent: ReturnType<typeof request.agent>,
    tenantId: string,
  ): Promise<void> => {
    await agent
      .post('/tenants/me/active')
      .set('Origin', ORIGIN)
      .send({ tenantId })
      .expect(200);
  };

  let ownerAgent: ReturnType<typeof request.agent>;
  let editorAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let outsiderOwnerAgent: ReturnType<typeof request.agent>;
  let noTenantAgent: ReturnType<typeof request.agent>;

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

    ownerAgent = request.agent(app.getHttpServer());
    editorAgent = request.agent(app.getHttpServer());
    viewerAgent = request.agent(app.getHttpServer());
    outsiderOwnerAgent = request.agent(app.getHttpServer());
    noTenantAgent = request.agent(app.getHttpServer());

    const ownerId = await register(
      ownerAgent,
      `owner-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const editorId = await register(
      editorAgent,
      `editor-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const viewerId = await register(
      viewerAgent,
      `viewer-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const outsiderOwnerId = await register(
      outsiderOwnerAgent,
      `outsider-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    await register(noTenantAgent, `sans-tenant-${RUN_ID}${EMAIL_DOMAIN}`);

    const tenantA = await adminPrisma.tenant.create({
      data: {
        slug: `tenant-authors-a-${RUN_ID}`,
        name: 'Maison A (test)',
        type: 'independent_author',
        status: 'active',
        createdBy: ownerId,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await adminPrisma.tenant.create({
      data: {
        slug: `tenant-authors-b-${RUN_ID}`,
        name: 'Maison B (test)',
        type: 'independent_author',
        status: 'active',
        createdBy: outsiderOwnerId,
      },
    });
    tenantBId = tenantB.id;

    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: ownerId,
        role: 'owner',
        status: 'active',
      },
    });
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: editorId,
        role: 'editor',
        status: 'active',
      },
    });
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: viewerId,
        role: 'viewer',
        status: 'active',
      },
    });
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantBId,
        userId: outsiderOwnerId,
        role: 'owner',
        status: 'active',
      },
    });

    await activate(ownerAgent, tenantAId);
    await activate(editorAgent, tenantAId);
    await activate(viewerAgent, tenantAId);
    await activate(outsiderOwnerAgent, tenantBId);
  });

  afterAll(async () => {
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'tenant-authors-' } },
    });
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

  it("refuse tout accès à qui n'a ni rôle plateforme ni tenant actif", async () => {
    const response = await noTenantAgent.get('/admin/authors').expect(403);
    expect((response.body as ErrorResponseBody).message).toContain(
      'Aucun espace actif',
    );
  });

  it('un owner de tenant crée un auteur, rattaché au bon tenant', async () => {
    const response = await ownerAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Owner A',
        slug: `tenant-authors-owner-${RUN_ID}`,
      })
      .expect(201);

    expect((response.body as { tenantId: string }).tenantId).toBe(tenantAId);
  });

  it('un editor de tenant crée aussi un auteur pour son tenant', async () => {
    const response = await editorAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Editor A',
        slug: `tenant-authors-editor-${RUN_ID}`,
      })
      .expect(201);

    expect((response.body as { tenantId: string }).tenantId).toBe(tenantAId);
  });

  it("un viewer ne peut PAS créer d'auteur — refus propre, pas une erreur brute de RLS", async () => {
    const response = await viewerAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Viewer A',
        slug: `tenant-authors-viewer-${RUN_ID}`,
      })
      .expect(403);

    const body = response.body as ErrorResponseBody;
    expect(body.message).toContain('rôle');
    expect(JSON.stringify(body)).not.toMatch(
      /row-level security|P2010|prisma/i,
    );
  });

  it("la liste d'un tenant ne montre jamais les auteurs d'un autre tenant", async () => {
    const asOwnerA = await ownerAgent
      .get('/admin/authors?perPage=100')
      .expect(200);
    const idsSeenByA = (
      asOwnerA.body as { data: { slug: string; tenantId: string }[] }
    ).data.map((a) => a.slug);
    expect(idsSeenByA).toContain(`tenant-authors-owner-${RUN_ID}`);

    const asOutsider = await outsiderOwnerAgent
      .get('/admin/authors?perPage=100')
      .expect(200);
    const idsSeenByB = (
      asOutsider.body as { data: { slug: string }[] }
    ).data.map((a) => a.slug);
    expect(idsSeenByB).not.toContain(`tenant-authors-owner-${RUN_ID}`);
  });

  it('un owner de tenant A ne peut ni voir ni modifier un auteur du tenant B', async () => {
    // `status: 'draft'`, jamais `'active'` : un auteur actif est délibérément
    // visible de tous par `authors_select` (annuaire public) — ce n'est pas ce
    // que ce test vérifie. Le brouillon, lui, ne doit être visible que du
    // tenant B.
    const authorB = await adminPrisma.author.create({
      data: {
        tenantId: tenantBId,
        penName: 'Auteur B protégé',
        slug: `tenant-authors-b-protege-${RUN_ID}`,
        status: 'draft',
      },
    });

    await ownerAgent.get(`/admin/authors/${authorB.id}`).expect(404);

    await ownerAgent
      .patch(`/admin/authors/${authorB.id}`)
      .set('Origin', ORIGIN)
      .send({ penName: 'Renommé illégalement' })
      .expect(404);

    const unchanged = await adminPrisma.author.findUniqueOrThrow({
      where: { id: authorB.id },
    });
    expect(unchanged.penName).toBe('Auteur B protégé');
  });
});
