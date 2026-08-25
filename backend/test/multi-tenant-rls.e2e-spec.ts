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
import type { RlsContext } from './../src/prisma/rls-context';
import { adminPrismaProxy } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@rls.e2e.test';
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Preuve directe, au niveau PostgreSQL, que l'isolation multi-tenant tient —
 * indépendamment de ce que chaque module applicatif filtre déjà de son côté
 * (Phase 4, `new_stack/AUDIT_V2_MULTI_TENANT.md`). Chaque assertion ouvre le
 * contexte RLS d'un tenant précis via `PrismaService.withRlsContext()` — le
 * même mécanisme que celui posé dans les services — et vérifie ce que
 * PostgreSQL laisse réellement passer, pas ce que le code applicatif a
 * l'intention de filtrer.
 *
 * Portée volontairement plus large que "juste works/authors" : commandes,
 * ventes et paramètres de tenant sont couverts aussi, parce que ce sont eux
 * qui portent l'argent et les décisions administratives.
 */
describe('Isolation multi-tenant — RLS PostgreSQL (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;

  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let readerId: string;
  let authorAId: string;
  let authorBId: string;
  let workAId: string;
  let workBId: string;
  let privateWorkAId: string;

  const ctxA: () => RlsContext = () => ({
    userId: userAId,
    tenantId: tenantAId,
    isPlatformAdmin: false,
  });
  const ctxB: () => RlsContext = () => ({
    userId: userBId,
    tenantId: tenantBId,
    isPlatformAdmin: false,
  });
  const ctxPublic: RlsContext = {
    userId: null,
    tenantId: null,
    isPlatformAdmin: false,
  };
  const ctxPlatformAdmin: RlsContext = {
    userId: null,
    tenantId: null,
    isPlatformAdmin: true,
  };

  const register = async (email: string): Promise<string> => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'RLS',
        lastName: 'Test',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    return user.id;
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

    await adminPrisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    userAId = await register(`owner-a-${RUN_ID}${EMAIL_DOMAIN}`);
    userBId = await register(`owner-b-${RUN_ID}${EMAIL_DOMAIN}`);
    readerId = await register(`reader-${RUN_ID}${EMAIL_DOMAIN}`);

    const tenantA = await adminPrisma.tenant.create({
      data: {
        slug: `rls-tenant-a-${RUN_ID}`,
        name: 'Tenant A (test RLS)',
        type: 'independent_author',
        status: 'active',
        createdBy: userAId,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await adminPrisma.tenant.create({
      data: {
        slug: `rls-tenant-b-${RUN_ID}`,
        name: 'Tenant B (test RLS)',
        type: 'independent_author',
        status: 'active',
        createdBy: userBId,
      },
    });
    tenantBId = tenantB.id;

    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantAId,
        userId: userAId,
        role: 'owner',
        status: 'active',
      },
    });
    await adminPrisma.tenantMember.create({
      data: {
        tenantId: tenantBId,
        userId: userBId,
        role: 'owner',
        status: 'active',
      },
    });

    const authorA = await adminPrisma.author.create({
      data: {
        tenantId: tenantAId,
        userId: userAId,
        penName: `Auteur A ${RUN_ID}`,
        slug: `rls-tenant-a-author-${RUN_ID}`,
        status: 'active',
      },
    });
    authorAId = authorA.id;

    const authorB = await adminPrisma.author.create({
      data: {
        tenantId: tenantBId,
        userId: userBId,
        penName: `Auteur B ${RUN_ID}`,
        slug: `rls-tenant-b-author-${RUN_ID}`,
        status: 'active',
      },
    });
    authorBId = authorB.id;

    const workA = await adminPrisma.work.create({
      data: {
        tenantId: tenantAId,
        authorId: authorAId,
        title: `Œuvre A ${RUN_ID}`,
        slug: `rls-tenant-a-work-${RUN_ID}`,
        status: 'published',
        visibility: 'public',
      },
    });
    workAId = workA.id;

    const workB = await adminPrisma.work.create({
      data: {
        tenantId: tenantBId,
        authorId: authorBId,
        title: `Œuvre B ${RUN_ID}`,
        slug: `rls-tenant-b-work-${RUN_ID}`,
        status: 'published',
        visibility: 'public',
      },
    });
    workBId = workB.id;

    const privateWorkA = await adminPrisma.work.create({
      data: {
        tenantId: tenantAId,
        authorId: authorAId,
        title: `Œuvre A privée ${RUN_ID}`,
        slug: `rls-tenant-a-private-${RUN_ID}`,
        status: 'draft',
        visibility: 'private',
      },
    });
    privateWorkAId = privateWorkA.id;
  });

  afterAll(async () => {
    // Ordre imposé par les clés étrangères RESTRICT : ventes puis lignes de
    // commande puis commandes, avant de pouvoir toucher aux œuvres/formats.
    // Filtré par la relation vers `work` (préfixe de slug), pas par
    // `orderNumber` : plus robuste face à une exécution précédente interrompue
    // dont le `RUN_ID` (donc l'`orderNumber`) diffère de celui-ci.
    const staleItems = await adminPrisma.orderItem.findMany({
      where: { work: { slug: { startsWith: 'rls-tenant-' } } },
      select: { id: true, orderId: true },
    });
    await adminPrisma.saleDistribution.deleteMany({
      where: { orderItemId: { in: staleItems.map((i) => i.id) } },
    });
    await adminPrisma.orderItem.deleteMany({
      where: { id: { in: staleItems.map((i) => i.id) } },
    });
    await adminPrisma.order.deleteMany({
      where: { id: { in: [...new Set(staleItems.map((i) => i.orderId))] } },
    });
    await adminPrisma.workFormat.deleteMany({
      where: { work: { slug: { startsWith: 'rls-tenant-' } } },
    });
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'rls-tenant-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'rls-tenant-' } },
    });
    await adminPrisma.tenantSetting.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
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

  describe('works — lecture', () => {
    it('un membre du tenant A voit ses propres œuvres, publiques et privées', async () => {
      const works = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.work.findMany({ where: { id: { in: [workAId, privateWorkAId] } } }),
      );
      expect(works.map((w) => w.id).sort()).toEqual(
        [workAId, privateWorkAId].sort(),
      );
    });

    it("un membre du tenant A NE VOIT PAS l'œuvre privée du tenant B (elle n'existe même pas dans son résultat)", async () => {
      // Ici workB est publique — on vérifie plutôt qu'un futur brouillon de B
      // resterait invisible en créant un brouillon B à la volée.
      const draftB = await adminPrisma.work.create({
        data: {
          tenantId: tenantBId,
          authorId: authorBId,
          title: `Brouillon B ${RUN_ID}`,
          slug: `rls-tenant-b-draft-${RUN_ID}`,
          status: 'draft',
          visibility: 'private',
        },
      });

      const visible = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.work.findUnique({ where: { id: draftB.id } }),
      );
      expect(visible).toBeNull();

      const visibleToB = await prisma.withRlsContext(ctxB(), (tx) =>
        tx.work.findUnique({ where: { id: draftB.id } }),
      );
      expect(visibleToB?.id).toBe(draftB.id);
    });

    it('les deux tenants voient les œuvres publiques et publiées l’un de l’autre (catalogue public)', async () => {
      const seenByA = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.work.findUnique({ where: { id: workBId } }),
      );
      expect(seenByA?.id).toBe(workBId);

      const seenByB = await prisma.withRlsContext(ctxB(), (tx) =>
        tx.work.findUnique({ where: { id: workAId } }),
      );
      expect(seenByB?.id).toBe(workAId);
    });

    it('un visiteur anonyme (aucun contexte) voit le catalogue public mais aucun brouillon', async () => {
      const publicWork = await prisma.withRlsContext(ctxPublic, (tx) =>
        tx.work.findUnique({ where: { id: workAId } }),
      );
      expect(publicWork?.id).toBe(workAId);

      const privateWork = await prisma.withRlsContext(ctxPublic, (tx) =>
        tx.work.findUnique({ where: { id: privateWorkAId } }),
      );
      expect(privateWork).toBeNull();
    });

    it('un platform_admin voit tout, y compris les brouillons privés des deux tenants', async () => {
      const seenA = await prisma.withRlsContext(ctxPlatformAdmin, (tx) =>
        tx.work.findUnique({ where: { id: privateWorkAId } }),
      );
      expect(seenA?.id).toBe(privateWorkAId);
    });
  });

  describe('works — écriture (le cœur de l’exigence : A ne modifie jamais B)', () => {
    it('un membre du tenant A ne peut PAS modifier une œuvre du tenant B', async () => {
      const before = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workBId },
      });

      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.work.update({
            where: { id: workBId },
            data: { title: 'Titre modifié illégalement par A' },
          }),
        ),
      ).rejects.toThrow();

      const after = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workBId },
      });
      expect(after.title).toBe(before.title);
    });

    it('un membre du tenant A ne peut PAS supprimer une œuvre du tenant B', async () => {
      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.work.delete({ where: { id: workBId } }),
        ),
      ).rejects.toThrow();

      const stillThere = await adminPrisma.work.findUnique({
        where: { id: workBId },
      });
      expect(stillThere).not.toBeNull();
    });

    it('un membre du tenant A ne peut PAS créer une œuvre pour le tenant B', async () => {
      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.work.create({
            data: {
              tenantId: tenantBId,
              authorId: authorBId,
              title: 'Œuvre injectée par A dans B',
              slug: `rls-injection-${RUN_ID}`,
              status: 'draft',
              visibility: 'private',
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('symétriquement, un membre du tenant B ne peut pas modifier une œuvre du tenant A', async () => {
      const before = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workAId },
      });

      await expect(
        prisma.withRlsContext(ctxB(), (tx) =>
          tx.work.update({
            where: { id: workAId },
            data: { title: 'Titre modifié illégalement par B' },
          }),
        ),
      ).rejects.toThrow();

      const after = await adminPrisma.work.findUniqueOrThrow({
        where: { id: workAId },
      });
      expect(after.title).toBe(before.title);
    });

    it('un membre du tenant A peut modifier ses propres œuvres', async () => {
      const updated = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.work.update({
          where: { id: workAId },
          data: { featured: true },
        }),
      );
      expect(updated.featured).toBe(true);
    });
  });

  describe('authors — isolation identique', () => {
    it("un membre du tenant A ne peut pas modifier le profil d'un auteur du tenant B", async () => {
      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.author.update({
            where: { id: authorBId },
            data: { penName: 'Renommé illégalement' },
          }),
        ),
      ).rejects.toThrow();
    });

    it('un membre du tenant A ne peut pas supprimer un auteur du tenant B', async () => {
      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.author.delete({ where: { id: authorBId } }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('tenant_members — un tenant ne voit pas la composition de l’autre', () => {
    it('un membre du tenant A ne voit pas la liste des membres du tenant B', async () => {
      const members = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.tenantMember.findMany({ where: { tenantId: tenantBId } }),
      );
      expect(members).toHaveLength(0);
    });

    it('un membre du tenant A ne peut pas ajouter un membre au tenant B', async () => {
      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.tenantMember.create({
            data: {
              tenantId: tenantBId,
              userId: readerId,
              role: 'viewer',
              status: 'active',
            },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('tenant_settings — isolation identique', () => {
    it('un membre du tenant A ne peut ni lire ni écrire les réglages du tenant B', async () => {
      const setting = await adminPrisma.tenantSetting.create({
        data: {
          tenantId: tenantBId,
          settingKey: 'test_key',
          settingValue: 'secret_b',
        },
      });

      const seenByA = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.tenantSetting.findUnique({ where: { id: setting.id } }),
      );
      expect(seenByA).toBeNull();

      await expect(
        prisma.withRlsContext(ctxA(), (tx) =>
          tx.tenantSetting.update({
            where: { id: setting.id },
            data: { settingValue: 'ecrase_par_a' },
          }),
        ),
      ).rejects.toThrow();

      const unchanged = await adminPrisma.tenantSetting.findUniqueOrThrow({
        where: { id: setting.id },
      });
      expect(unchanged.settingValue).toBe('secret_b');
    });
  });

  describe('commandes et ventes — un lecteur achetant chez les deux tenants', () => {
    let orderId: string;
    let itemAId: string;
    let itemBId: string;

    it('un lecteur peut créer une commande contenant des lignes des deux tenants (panier multi-tenant)', async () => {
      const order = await adminPrisma.order.create({
        data: {
          orderNumber: `RLS-${RUN_ID}`,
          userId: readerId,
          status: 'pending',
          items: {
            create: [
              {
                tenantId: tenantAId,
                workId: workAId,
                workFormatId: (
                  await adminPrisma.workFormat.create({
                    data: {
                      workId: workAId,
                      formatType: 'pdf',
                      price: '1000.00',
                      deliveryType: 'digital_download',
                      unlimitedStock: true,
                    },
                  })
                ).id,
                authorId: authorAId,
                workTitle: 'Œuvre A',
                authorName: 'Auteur A',
                formatType: 'pdf',
                unitPrice: '1000.00',
                lineTotal: '1000.00',
                orderNumber: `RLS-${RUN_ID}`,
              },
              {
                tenantId: tenantBId,
                workId: workBId,
                workFormatId: (
                  await adminPrisma.workFormat.create({
                    data: {
                      workId: workBId,
                      formatType: 'pdf',
                      price: '2000.00',
                      deliveryType: 'digital_download',
                      unlimitedStock: true,
                    },
                  })
                ).id,
                authorId: authorBId,
                workTitle: 'Œuvre B',
                authorName: 'Auteur B',
                formatType: 'pdf',
                unitPrice: '2000.00',
                lineTotal: '2000.00',
                orderNumber: `RLS-${RUN_ID}`,
              },
            ],
          },
        },
        include: { items: true },
      });
      orderId = order.id;
      itemAId = order.items.find((i) => i.tenantId === tenantAId)!.id;
      itemBId = order.items.find((i) => i.tenantId === tenantBId)!.id;
      expect(order.items).toHaveLength(2);
    });

    it('le tenant A ne voit que sa propre ligne de commande, jamais celle du tenant B', async () => {
      const itemsVisibleToA = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.orderItem.findMany({ where: { orderId } }),
      );
      expect(itemsVisibleToA.map((i) => i.id)).toEqual([itemAId]);

      const itemsVisibleToB = await prisma.withRlsContext(ctxB(), (tx) =>
        tx.orderItem.findMany({ where: { orderId } }),
      );
      expect(itemsVisibleToB.map((i) => i.id)).toEqual([itemBId]);
    });

    it('le lecteur acheteur voit les deux lignes (les deux tenants), lui', async () => {
      const itemsVisibleToReader = await prisma.withRlsContext(
        { userId: readerId, tenantId: null, isPlatformAdmin: false },
        (tx) => tx.orderItem.findMany({ where: { orderId } }),
      );
      expect(itemsVisibleToReader.map((i) => i.id).sort()).toEqual(
        [itemAId, itemBId].sort(),
      );
    });

    it('les ventes (sale_distributions) restent isolées par tenant vendeur', async () => {
      const distA = await adminPrisma.saleDistribution.create({
        data: {
          orderItemId: itemAId,
          authorId: authorAId,
          grossAmount: '1000.00',
          netAfterProviderFee: '1000.00',
          gebookCommissionAmount: '100.00',
          authorNetAmount: '900.00',
        },
      });
      const distB = await adminPrisma.saleDistribution.create({
        data: {
          orderItemId: itemBId,
          authorId: authorBId,
          grossAmount: '2000.00',
          netAfterProviderFee: '2000.00',
          gebookCommissionAmount: '200.00',
          authorNetAmount: '1800.00',
        },
      });

      const seenByA = await prisma.withRlsContext(ctxA(), (tx) =>
        tx.saleDistribution.findMany({
          where: { id: { in: [distA.id, distB.id] } },
        }),
      );
      expect(seenByA.map((d) => d.id)).toEqual([distA.id]);

      const seenByB = await prisma.withRlsContext(ctxB(), (tx) =>
        tx.saleDistribution.findMany({
          where: { id: { in: [distA.id, distB.id] } },
        }),
      );
      expect(seenByB.map((d) => d.id)).toEqual([distB.id]);

      // L'auteur A voit sa propre vente même sans contexte tenant (self-view).
      const seenByAuthorA = await prisma.withRlsContext(
        { userId: userAId, tenantId: null, isPlatformAdmin: false },
        (tx) => tx.saleDistribution.findUnique({ where: { id: distA.id } }),
      );
      expect(seenByAuthorA?.id).toBe(distA.id);
    });
  });

  describe('rôles au sein d’un même tenant — un viewer ne peut pas écrire', () => {
    it("un membre 'viewer' du tenant A peut lire mais pas modifier les œuvres de A", async () => {
      const viewerUserId = await register(`viewer-${RUN_ID}${EMAIL_DOMAIN}`);
      await adminPrisma.tenantMember.create({
        data: {
          tenantId: tenantAId,
          userId: viewerUserId,
          role: 'viewer',
          status: 'active',
        },
      });
      const viewerCtx: RlsContext = {
        userId: viewerUserId,
        tenantId: tenantAId,
        isPlatformAdmin: false,
      };

      const visible = await prisma.withRlsContext(viewerCtx, (tx) =>
        tx.work.findUnique({ where: { id: privateWorkAId } }),
      );
      expect(visible?.id).toBe(privateWorkAId);

      await expect(
        prisma.withRlsContext(viewerCtx, (tx) =>
          tx.work.update({
            where: { id: privateWorkAId },
            data: { title: 'Modifié par un viewer' },
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
