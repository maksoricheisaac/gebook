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
  let editorAgent: ReturnType<typeof request.agent>;
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
    editorAgent = request.agent(app.getHttpServer());
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
    const editorId = await register(
      editorAgent,
      `editor-${RUN_ID}${EMAIL_DOMAIN}`,
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
        userId: editorId,
        role: 'editor',
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
    await activate(editorAgent, tenantAId);
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
    // `startsWith` plutôt que `id: { in: [tenantAId, tenantBId] }` : couvre
    // aussi le tenant suspendu créé par le test « tenant inactif » (Phase 3,
    // mission), jamais assigné à une variable suivie individuellement ici.
    await adminPrisma.tenant.deleteMany({
      where: { slug: { startsWith: 'tenant-works-' } },
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

  describe('workflow éditorial — rôle "editor" (Phase 4)', () => {
    it('un editor peut créer une œuvre en brouillon, mais pas directement publiée', async () => {
      const created = await editorAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send(workPayload(`tenant-works-editor-draft-${RUN_ID}`, authorOtherId))
        .expect(201);
      expect((created.body as { status: string }).status).toBe('draft');

      const rejected = await editorAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send({
          ...workPayload(
            `tenant-works-editor-published-${RUN_ID}`,
            authorOtherId,
          ),
          status: 'published',
        })
        .expect(403);
      expect((rejected.body as ErrorResponseBody).message).toContain('éditeur');
    });

    it('un editor peut faire passer une œuvre soumise en relecture, mais pas l’approuver ni la publier', async () => {
      const created = await ownerAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send(
          workPayload(`tenant-works-editor-review-${RUN_ID}`, authorOtherId),
        )
        .expect(201);
      const workId = (created.body as { id: string }).id;

      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'submitted' })
        .expect(200);

      const approveAttempt = await editorAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'approved' })
        .expect(403);
      expect((approveAttempt.body as ErrorResponseBody).message).toContain(
        'éditeur',
      );

      await editorAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'under_review' })
        .expect(200);

      const publishAttempt = await editorAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'published' })
        .expect(403);
      expect((publishAttempt.body as ErrorResponseBody).message).toContain(
        'éditeur',
      );

      const stillUnderReview = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workId },
      });
      expect(stillUnderReview.status).toBe('under_review');

      // La direction de l'espace, elle, conserve l'autorité déjà testée
      // ci-dessus (un owner publie directement, sans étape intermédiaire).
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'approved' })
        .expect(200);
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'published' })
        .expect(200);

      // Renvoyer le même statut (formulaire qui ne touche qu'un autre champ)
      // n'est pas une transition et ne doit jamais être refusé, même à un
      // rôle qui ne pourrait pas ATTEINDRE ce statut lui-même. `pageCount`
      // sert d'« autre champ » ici — `featured` ne se PATCH plus du tout par
      // cette route (réservé au SuperAdmin, voir `PATCH /admin/works/featured/:id`).
      await editorAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'published', pageCount: 250 })
        .expect(200);

      const stillPublished = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workId },
      });
      expect(stillPublished.status).toBe('published');
      expect(stillPublished.pageCount).toBe(250);
    });
  });

  describe('visibilité publique (Phase 4)', () => {
    it('une œuvre "tenant_only" publiée n’apparaît jamais dans le catalogue public agrégé', async () => {
      const created = await ownerAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send(
          workPayload(
            `tenant-works-visibility-tenant-only-${RUN_ID}`,
            authorOtherId,
          ),
        )
        .expect(201);
      const workId = (created.body as { id: string }).id;

      // Chemin complet jusqu'à la publication, comme pour toute œuvre réelle.
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'submitted' })
        .expect(200);
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'under_review' })
        .expect(200);
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'approved' })
        .expect(200);
      // Publiée, mais explicitement réservée au tenant — jamais dans
      // l'agrégat multi-tenant, mais bien sur sa propre fiche et la vitrine
      // de son tenant (Phase 5) : c'est très exactement ce que `tenant_only`
      // veut dire, pas une invisibilité totale.
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'published', visibility: 'tenant_only' })
        .expect(200);

      const slug = `tenant-works-visibility-tenant-only-${RUN_ID}`;

      // Absente de l'agrégat multi-tenant, avec ou sans recherche.
      const list = await request(app.getHttpServer())
        .get(`/works?q=${encodeURIComponent(slug)}`)
        .expect(200);
      const slugs = (list.body as { data: { slug: string }[] }).data.map(
        (w) => w.slug,
      );
      expect(slugs).not.toContain(slug);

      // Consultable par lien direct — une œuvre `tenant_only` n'est pas
      // secrète, seulement non listée dans l'agrégat.
      await request(app.getHttpServer()).get(`/works/${slug}`).expect(200);

      // Et bien listée dans la vitrine de SON tenant (Phase 5).
      const storefront = await request(app.getHttpServer())
        .get(`/works?tenant=tenant-works-a-${RUN_ID}`)
        .expect(200);
      const storefrontSlugs = (
        storefront.body as { data: { slug: string }[] }
      ).data.map((w) => w.slug);
      expect(storefrontSlugs).toContain(slug);

      // Mais reste bien visible depuis le back-office du tenant lui-même.
      const adminView = await ownerAgent
        .get(`/admin/works/${workId}`)
        .expect(200);
      expect((adminView.body as { visibility: string }).visibility).toBe(
        'tenant_only',
      );
    });

    it('une œuvre publiée "public" (par défaut) reste visible dans le catalogue agrégé', async () => {
      const created = await ownerAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send(
          workPayload(
            `tenant-works-visibility-public-${RUN_ID}`,
            authorOtherId,
          ),
        )
        .expect(201);
      const workId = (created.body as { id: string }).id;

      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'submitted' })
        .expect(200);
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'under_review' })
        .expect(200);
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'approved' })
        .expect(200);
      // Aucune visibilité explicite : doit retomber sur `public` par défaut
      // (comportement historique préservé, `resolveVisibility()`).
      await ownerAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'published' })
        .expect(200);

      const slug = `tenant-works-visibility-public-${RUN_ID}`;
      await request(app.getHttpServer()).get(`/works/${slug}`).expect(200);
    });
  });

  describe('vitrine publique d’un tenant (Phase 5)', () => {
    it('expose le profil public d’un tenant actif, par slug', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/public/tenant-works-a-${RUN_ID}`)
        .expect(200);

      const body = response.body as {
        slug: string;
        name: string;
        type: string;
      };
      expect(body.slug).toBe(`tenant-works-a-${RUN_ID}`);
      expect(body.name).toBe('Maison A (test œuvres)');
      expect(body.type).toBe('independent_author');
    });

    it('refuse un slug de tenant inconnu', async () => {
      await request(app.getHttpServer())
        .get(`/tenants/public/aucun-tel-espace-${RUN_ID}`)
        .expect(404);
    });

    it('liste les auteurs d’un tenant via le filtre public `?tenant=`', async () => {
      const response = await request(app.getHttpServer())
        .get(`/authors?tenant=tenant-works-a-${RUN_ID}`)
        .expect(200);

      const slugs = (response.body as { slug: string }[]).map((a) => a.slug);
      expect(slugs).toContain(`tenant-works-author-self-${RUN_ID}`);
      expect(slugs).not.toContain(`tenant-works-author-b-${RUN_ID}`);
    });

    it('refuse un tenant suspendu (mission — « tenant inactif → inaccessible »)', async () => {
      const suspendedSlug = `tenant-works-suspended-${RUN_ID}`;
      await adminPrisma.tenant.create({
        data: {
          slug: suspendedSlug,
          name: 'Maison suspendue (test œuvres)',
          type: 'independent_author',
          status: 'suspended',
        },
      });

      await request(app.getHttpServer())
        .get(`/tenants/public/${suspendedSlug}`)
        .expect(404);
    });

    it('une œuvre "private" publiée n’apparaît jamais dans la vitrine, ni par lien direct', async () => {
      const slug = `tenant-works-visibility-private-${RUN_ID}`;
      await adminPrisma.work.create({
        data: {
          tenantId: tenantAId,
          authorId: authorOtherId,
          title: 'Œuvre privée publiée',
          slug,
          status: 'published',
          visibility: 'private',
        },
      });

      // Ni dans la vitrine de son propre tenant…
      const storefront = await request(app.getHttpServer())
        .get(`/works?tenant=tenant-works-a-${RUN_ID}`)
        .expect(200);
      const storefrontSlugs = (
        storefront.body as { data: { slug: string }[] }
      ).data.map((w) => w.slug);
      expect(storefrontSlugs).not.toContain(slug);

      // … ni par lien direct : `visibleWithinOwnTenant` exige `visibility !== 'private'`.
      await request(app.getHttpServer()).get(`/works/${slug}`).expect(404);
    });

    it('une œuvre publiée d’un autre tenant n’apparaît jamais dans MA vitrine', async () => {
      const slug = `tenant-works-b-visible-in-a-${RUN_ID}`;
      await adminPrisma.work.create({
        data: {
          tenantId: tenantBId,
          authorId: authorBId,
          title: 'Œuvre publique du tenant B',
          slug,
          status: 'published',
          visibility: 'public',
        },
      });

      // Visible dans SA propre vitrine (tenant B)…
      const storefrontB = await request(app.getHttpServer())
        .get(`/works?tenant=tenant-works-b-${RUN_ID}`)
        .expect(200);
      expect(
        (storefrontB.body as { data: { slug: string }[] }).data.map(
          (w) => w.slug,
        ),
      ).toContain(slug);

      // … jamais dans celle du tenant A.
      const storefrontA = await request(app.getHttpServer())
        .get(`/works?tenant=tenant-works-a-${RUN_ID}`)
        .expect(200);
      expect(
        (storefrontA.body as { data: { slug: string }[] }).data.map(
          (w) => w.slug,
        ),
      ).not.toContain(slug);
    });
  });
});
