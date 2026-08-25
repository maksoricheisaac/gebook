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
const EMAIL_DOMAIN = '@tenant-works.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Complète `admin-authors-tenant.e2e-spec.ts` : même mécanisme
 * (`TenantAccessGuard` + `TenantContextService`), mais `admin-works` ajoute
 * une nuance que les auteurs n'ont pas — un membre `author` ne peut écrire que
 * sur SES PROPRES œuvres, pas sur celles des autres auteurs du même tenant
 * (`assertCanWriteWork`, alignée sur la policy RLS `works_insert`).
 */
describe('Back-office Œuvres — accès par tenant (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;

  let tenantAId: string;
  let tenantBId: string;
  let authorSelfId: string;
  let authorOtherId: string;
  let authorBId: string;

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

  const workPayload = (slug: string, authorId: string) => ({
    authorId,
    slug,
    translations: { fr: { title: `Œuvre ${slug}` } },
  });

  let ownerAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let authorSelfAgent: ReturnType<typeof request.agent>;
  let outsiderOwnerAgent: ReturnType<typeof request.agent>;

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
    viewerAgent = request.agent(app.getHttpServer());
    authorSelfAgent = request.agent(app.getHttpServer());
    outsiderOwnerAgent = request.agent(app.getHttpServer());

    const ownerId = await register(
      ownerAgent,
      `owner-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const viewerId = await register(
      viewerAgent,
      `viewer-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const authorSelfUserId = await register(
      authorSelfAgent,
      `author-self-${RUN_ID}${EMAIL_DOMAIN}`,
    );
    const outsiderOwnerId = await register(
      outsiderOwnerAgent,
      `outsider-${RUN_ID}${EMAIL_DOMAIN}`,
    );

    const tenantA = await adminPrisma.tenant.create({
      data: {
        slug: `tenant-works-a-${RUN_ID}`,
        name: 'Maison A (test œuvres)',
        type: 'independent_author',
        status: 'active',
        createdBy: ownerId,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await adminPrisma.tenant.create({
      data: {
        slug: `tenant-works-b-${RUN_ID}`,
        name: 'Maison B (test œuvres)',
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
        userId: viewerId,
        role: 'viewer',
        status: 'active',
      },
    });
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: authorSelfUserId,
        role: 'author',
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

    const authorSelf = await adminPrisma.author.create({
      data: {
        tenantId: tenantAId,
        userId: authorSelfUserId,
        penName: `Auteur Self ${RUN_ID}`,
        slug: `tenant-works-author-self-${RUN_ID}`,
        status: 'active',
      },
    });
    authorSelfId = authorSelf.id;

    const authorOther = await adminPrisma.author.create({
      data: {
        tenantId: tenantAId,
        penName: `Auteur Other ${RUN_ID}`,
        slug: `tenant-works-author-other-${RUN_ID}`,
        status: 'active',
      },
    });
    authorOtherId = authorOther.id;

    const authorB = await adminPrisma.author.create({
      data: {
        tenantId: tenantBId,
        penName: `Auteur B ${RUN_ID}`,
        slug: `tenant-works-author-b-${RUN_ID}`,
        status: 'active',
      },
    });
    authorBId = authorB.id;

    await activate(ownerAgent, tenantAId);
    await activate(viewerAgent, tenantAId);
    await activate(authorSelfAgent, tenantAId);
    await activate(outsiderOwnerAgent, tenantBId);
  });

  afterAll(async () => {
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'tenant-works-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'tenant-works-' } },
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

  it('un owner de tenant crée une œuvre pour un auteur de son tenant', async () => {
    const response = await ownerAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send(workPayload(`tenant-works-owner-${RUN_ID}`, authorOtherId))
      .expect(201);

    expect((response.body as { tenantId: string }).tenantId).toBe(tenantAId);
  });

  it("un viewer ne peut pas créer d'œuvre", async () => {
    const response = await viewerAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send(workPayload(`tenant-works-viewer-${RUN_ID}`, authorOtherId))
      .expect(403);

    expect((response.body as ErrorResponseBody).message).toContain('rôle');
  });

  it('un membre "author" crée une œuvre pour SON PROPRE profil auteur', async () => {
    const response = await authorSelfAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send(workPayload(`tenant-works-author-self-${RUN_ID}`, authorSelfId))
      .expect(201);

    expect((response.body as { authorId: string }).authorId).toBe(authorSelfId);
  });

  it('un membre "author" NE PEUT PAS créer une œuvre pour un AUTRE auteur du même tenant', async () => {
    const response = await authorSelfAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send(workPayload(`tenant-works-author-other-${RUN_ID}`, authorOtherId))
      .expect(403);

    expect((response.body as ErrorResponseBody).message).toContain('rôle');
  });

  it('un membre "author" peut soumettre sa propre œuvre à la relecture, mais pas la publier lui-même', async () => {
    const created = await authorSelfAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send(workPayload(`tenant-works-author-workflow-${RUN_ID}`, authorSelfId))
      .expect(201);
    const workId = (created.body as { id: string }).id;

    await authorSelfAgent
      .patch(`/admin/works/${workId}`)
      .set('Origin', ORIGIN)
      .send({ status: 'submitted' })
      .expect(200);

    const rejected = await authorSelfAgent
      .patch(`/admin/works/${workId}`)
      .set('Origin', ORIGIN)
      .send({ status: 'published' })
      .expect(403);
    expect((rejected.body as ErrorResponseBody).message).toContain(
      'publication',
    );

    const stillSubmitted = await adminPrisma.work.findUniqueOrThrow({
      where: { id: workId },
    });
    expect(stillSubmitted.status).toBe('submitted');

    await ownerAgent
      .patch(`/admin/works/${workId}`)
      .set('Origin', ORIGIN)
      .send({ status: 'published' })
      .expect(200);
  });

  it("la liste d'un tenant ne montre jamais les œuvres d'un autre tenant", async () => {
    const asOwnerA = await ownerAgent
      .get('/admin/works?perPage=100')
      .expect(200);
    const slugsSeenByA = (
      asOwnerA.body as { data: { slug: string }[] }
    ).data.map((w) => w.slug);
    expect(slugsSeenByA).toContain(`tenant-works-owner-${RUN_ID}`);

    const asOutsider = await outsiderOwnerAgent
      .get('/admin/works?perPage=100')
      .expect(200);
    const slugsSeenByB = (
      asOutsider.body as { data: { slug: string }[] }
    ).data.map((w) => w.slug);
    expect(slugsSeenByB).not.toContain(`tenant-works-owner-${RUN_ID}`);
  });

  it('un owner de tenant A ne peut ni voir ni modifier une œuvre brouillon du tenant B', async () => {
    const workB = await adminPrisma.work.create({
      data: {
        tenantId: tenantBId,
        authorId: authorBId,
        title: 'Œuvre B protégée',
        slug: `tenant-works-b-protegee-${RUN_ID}`,
        status: 'draft',
        visibility: 'private',
      },
    });

    await ownerAgent.get(`/admin/works/${workB.id}`).expect(404);

    await ownerAgent
      .patch(`/admin/works/${workB.id}`)
      .set('Origin', ORIGIN)
      .send({ status: 'published' })
      .expect(404);

    const unchanged = await adminPrisma.work.findUniqueOrThrow({
      where: { id: workB.id },
    });
    expect(unchanged.status).toBe('draft');
  });
});
