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
const EMAIL_DOMAIN = '@team.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * `TeamController`/`TeamService` (brief §7) : au-delà de ce que `TenantAccessGuard`
 * (accès grossier — un espace actif suffit) vérifie déjà côté HTTP dans
 * `admin-authors-tenant.e2e-spec.ts`, cette suite couvre les règles propres à la
 * gestion d'équipe — attribution du rôle propriétaire, protection du dernier
 * propriétaire, retrait de soi-même — qui vivent uniquement dans `TeamService`,
 * pas dans RLS.
 */
describe('Équipe de tenant (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;

  let tenantAId: string;
  let tenantBId: string;
  let editorMemberId: string;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<string> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Team',
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
  let owner2Agent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let editorAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;

  const ownerEmail = `owner-${RUN_ID}${EMAIL_DOMAIN}`;
  const owner2Email = `owner2-${RUN_ID}${EMAIL_DOMAIN}`;
  const adminEmail = `admin-${RUN_ID}${EMAIL_DOMAIN}`;
  const editorEmail = `editor-${RUN_ID}${EMAIL_DOMAIN}`;
  const viewerEmail = `viewer-${RUN_ID}${EMAIL_DOMAIN}`;

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
    owner2Agent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());
    editorAgent = request.agent(app.getHttpServer());
    viewerAgent = request.agent(app.getHttpServer());
    outsiderAgent = request.agent(app.getHttpServer());

    const ownerId = await register(ownerAgent, ownerEmail);
    const owner2Id = await register(owner2Agent, owner2Email);
    const adminId = await register(adminAgent, adminEmail);
    const editorId = await register(editorAgent, editorEmail);
    const viewerId = await register(viewerAgent, viewerEmail);
    const outsiderId = await register(
      outsiderAgent,
      `outsider-${RUN_ID}${EMAIL_DOMAIN}`,
    );

    const tenantA = await adminPrisma.tenant.create({
      data: {
        slug: `team-a-${RUN_ID}`,
        name: 'Équipe A (test)',
        type: 'independent_author',
        status: 'active',
        createdBy: ownerId,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await adminPrisma.tenant.create({
      data: {
        slug: `team-b-${RUN_ID}`,
        name: 'Équipe B (test)',
        type: 'independent_author',
        status: 'active',
        createdBy: outsiderId,
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
        userId: adminId,
        role: 'admin',
        status: 'active',
      },
    });
    const editorMember = await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: editorId,
        role: 'editor',
        status: 'active',
      },
    });
    editorMemberId = editorMember.id;
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
        userId: outsiderId,
        role: 'owner',
        status: 'active',
      },
    });

    // owner2 n'est pas encore membre de tenant A : il ne le devient qu'au fil
    // des tests d'invitation, mais peut déjà choisir cet espace comme actif
    // (l'activation valide juste que le tenant existe, l'adhésion réelle
    // reste vérifiée par `TenantAccessGuard`/RLS à chaque requête suivante).
    void owner2Id;
    await activate(ownerAgent, tenantAId);
    await activate(adminAgent, tenantAId);
    await activate(editorAgent, tenantAId);
    await activate(viewerAgent, tenantAId);
    await activate(outsiderAgent, tenantBId);
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

  describe('lecture', () => {
    it("un simple viewer peut voir la liste de l'équipe", async () => {
      const response = await viewerAgent.get('/admin/team').expect(200);
      const emails = (response.body as { email: string }[]).map((m) => m.email);
      expect(emails).toContain(ownerEmail);
    });
  });

  describe('invitation', () => {
    it('un admin invite un membre existant avec un rôle non-propriétaire', async () => {
      const response = await adminAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: owner2Email, role: 'finance' })
        .expect(201);

      expect((response.body as { role: string }).role).toBe('finance');

      // Nettoyage immédiat : ce membre sert à d'autres tests avec un rôle owner.
      const created = response.body as { id: string };
      await adminPrisma.tenantMember.delete({ where: { id: created.id } });
    });

    it('un viewer ne peut pas inviter', async () => {
      const response = await viewerAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: owner2Email, role: 'viewer' })
        .expect(403);

      expect((response.body as ErrorResponseBody).message).toContain('rôle');
    });

    it('un admin (non propriétaire) ne peut pas attribuer le rôle propriétaire', async () => {
      const response = await adminAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: owner2Email, role: 'owner' })
        .expect(403);

      expect((response.body as ErrorResponseBody).message).toContain(
        'propriétaire',
      );
    });

    it('un propriétaire peut attribuer le rôle propriétaire', async () => {
      const response = await ownerAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: owner2Email, role: 'owner' })
        .expect(201);

      expect((response.body as { role: string }).role).toBe('owner');
    });

    it("refuse d'inviter une adresse sans compte GeBook", async () => {
      const response = await ownerAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: `personne-${RUN_ID}${EMAIL_DOMAIN}`, role: 'viewer' })
        .expect(404);

      expect((response.body as ErrorResponseBody).message).toContain(
        'compte GeBook',
      );
    });

    it('refuse une personne déjà membre', async () => {
      await ownerAgent
        .post('/admin/team')
        .set('Origin', ORIGIN)
        .send({ email: editorEmail, role: 'viewer' })
        .expect(409);
    });
  });

  describe('changement de rôle', () => {
    it('un admin change le rôle d’un editor', async () => {
      const response = await adminAgent
        .patch(`/admin/team/${editorMemberId}`)
        .set('Origin', ORIGIN)
        .send({ role: 'marketing' })
        .expect(200);

      expect((response.body as { role: string }).role).toBe('marketing');

      await adminPrisma.tenantMember.update({
        where: { id: editorMemberId },
        data: { role: 'editor' },
      });
    });

    it("un admin ne peut pas changer le rôle d'un propriétaire", async () => {
      const owner = await adminPrisma.tenantMember.findFirstOrThrow({
        where: {
          tenantId: tenantAId,
          role: 'owner',
          user: { email: ownerEmail },
        },
      });

      const response = await adminAgent
        .patch(`/admin/team/${owner.id}`)
        .set('Origin', ORIGIN)
        .send({ role: 'admin' })
        .expect(403);

      expect((response.body as ErrorResponseBody).message).toContain(
        'propriétaire',
      );
    });

    it('refuse de rétrograder le dernier propriétaire restant', async () => {
      // À ce stade, ownerEmail et owner2Email sont tous deux propriétaires : on
      // rétrograde owner2 d'abord pour isoler le vrai dernier propriétaire.
      const owner2 = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantAId, user: { email: owner2Email } },
      });
      await owner2Agent
        .patch(`/admin/team/${owner2.id}`)
        .set('Origin', ORIGIN)
        .send({ role: 'admin' })
        .expect(200);

      const lastOwner = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantAId, role: 'owner' },
      });

      const response = await ownerAgent
        .patch(`/admin/team/${lastOwner.id}`)
        .set('Origin', ORIGIN)
        .send({ role: 'admin' })
        .expect(409);

      expect((response.body as ErrorResponseBody).message).toContain(
        'aucun propriétaire',
      );

      // Restaure owner2 comme second propriétaire pour le reste de la suite.
      await adminPrisma.tenantMember.update({
        where: { id: owner2.id },
        data: { role: 'owner' },
      });
    });
  });

  describe('retrait', () => {
    it('un membre peut se retirer lui-même, quel que soit son rôle', async () => {
      await editorAgent
        .delete(`/admin/team/${editorMemberId}`)
        .set('Origin', ORIGIN)
        .expect(204);

      const stillThere = await adminPrisma.tenantMember.findUnique({
        where: { id: editorMemberId },
      });
      expect(stillThere).toBeNull();
    });

    it('un propriétaire retire un autre membre', async () => {
      const admin = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantAId, user: { email: adminEmail } },
      });

      await ownerAgent
        .delete(`/admin/team/${admin.id}`)
        .set('Origin', ORIGIN)
        .expect(204);
    });

    it('refuse de retirer le dernier propriétaire restant', async () => {
      const owner2 = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantAId, user: { email: owner2Email } },
      });
      await owner2Agent
        .delete(`/admin/team/${owner2.id}`)
        .set('Origin', ORIGIN)
        .expect(204);

      const lastOwner = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantAId, role: 'owner' },
      });

      const response = await ownerAgent
        .delete(`/admin/team/${lastOwner.id}`)
        .set('Origin', ORIGIN)
        .expect(409);

      expect((response.body as ErrorResponseBody).message).toContain(
        'aucun propriétaire',
      );
    });
  });

  describe('isolation entre tenants', () => {
    it('un propriétaire du tenant A ne peut pas agir sur un membre du tenant B', async () => {
      const outsiderMember = await adminPrisma.tenantMember.findFirstOrThrow({
        where: { tenantId: tenantBId },
      });

      await ownerAgent
        .patch(`/admin/team/${outsiderMember.id}`)
        .set('Origin', ORIGIN)
        .send({ role: 'viewer' })
        .expect(404);
    });
  });
});
