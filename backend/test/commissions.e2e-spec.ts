import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { FakePaymentDriver } from './../src/modules/payments/drivers/fake-payment.driver';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminPrismaProxy } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase10.e2e.test';
const PRICE = '10000.00';
const PRICE_MINOR = 1000000;
const RUN_ID = randomUUID().slice(0, 8);
const RULE_NAME = `Règle phase 10 ${RUN_ID}`;

/**
 * Tests de la phase 10 (commissions).
 *
 * Ils vérifient les règles n° 13 à 16 sur la base réelle. Le point central :
 * une répartition est un **instantané**. Changer la règle, ou la supprimer, ne
 * doit rien changer aux ventes déjà conclues — c'est ce que la formule seule ne
 * peut pas garantir, et que seule la base peut démontrer.
 */
describe('Commissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let fakeDriver: FakePaymentDriver;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;
  let authorAgent: ReturnType<typeof request.agent>;
  let authorId: string;
  let formatId: string;
  let ruleId: string;
  let eventCounter = 0;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<string> => {
    const response = await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Phase10',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  };

  /** Achète et règle réellement : la répartition doit naître du paiement. */
  const buyAndSettle = async (quantity = 1): Promise<string> => {
    const order = await readerAgent
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({ items: [{ workFormatId: formatId, quantity }] })
      .expect(201);
    const orderNumber = (order.body as { orderNumber: string }).orderNumber;

    const payment = await readerAgent
      .post('/payments')
      .set('Origin', ORIGIN)
      .send({ orderNumber })
      .expect(201);
    const stored = await adminPrisma.payment.findUniqueOrThrow({
      where: { id: (payment.body as { id: string }).id },
    });

    const rawBody = Buffer.from(
      JSON.stringify({
        eventId: `evt_phase10_${RUN_ID}_${(eventCounter += 1)}`,
        transactionId: stored.providerTransactionId,
        status: 'successful',
        amountMinor: PRICE_MINOR * quantity,
        // 2,5 % de frais prestataire, pour que la base de calcul se voie.
        feeMinor: (PRICE_MINOR * quantity) / 40,
      }),
      'utf8',
    );

    await request(app.getHttpServer())
      .post('/webhooks/fake')
      .set('Content-Type', 'application/json')
      .set(fakeDriver.signWebhook(rawBody))
      .send(rawBody.toString('utf8'))
      .expect(200);

    return orderNumber;
  };

  const distributionOf = async (orderNumber: string) =>
    adminPrisma.saleDistribution.findFirstOrThrow({
      where: { orderItem: { order: { orderNumber } } },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
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
    fakeDriver = app.get(FakePaymentDriver);

    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    adminAgent = request.agent(app.getHttpServer());
    readerAgent = request.agent(app.getHttpServer());
    authorAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAgent, `lecteur${EMAIL_DOMAIN}`);
    const authorUserId = await register(authorAgent, `auteur${EMAIL_DOMAIN}`);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });
    // Toutes les requêtes e2e partagent la même IP source : sans ce
    // nettoyage, un test de limitation de connexion exécuté en parallèle dans
    // un autre fichier (`auth.e2e-spec.ts`) peut faire échouer cette
    // connexion légitime avec un 429.
    await prisma.loginAttempt.deleteMany({});
    await adminAgent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: adminEmail, password: 'MotDePasse1' })
      .expect(200);

    const author = await adminAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Phase 10',
        slug: 'phase10-auteur',
        status: 'active',
      })
      .expect(201);
    authorId = (author.body as { id: string }).id;

    // Rattachement du compte à la fiche d'auteur : c'est ce qui ouvre l'accès
    // aux revenus (règle n° 4 — les deux existent indépendamment).
    await adminPrisma.author.update({
      where: { id: authorId },
      data: { userId: authorUserId },
    });

    const work = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        translations: { fr: { title: 'Œuvre Phase 10' } },
        slug: 'phase10-oeuvre',
        status: 'published',
      })
      .expect(201);

    const format = await adminAgent
      .post(`/admin/works/${(work.body as { id: string }).id}/formats`)
      .set('Origin', ORIGIN)
      .send({
        formatType: 'pdf',
        price: PRICE,
        deliveryType: 'digital_download',
      })
      .expect(201);
    formatId = (format.body as { id: string }).id;

    // Règle propre à cet auteur : elle l'emporte sur la règle générale du seed,
    // ce qui rend les montants attendus indépendants des données de référence.
    const rule = await adminAgent
      .post('/admin/commission-rules')
      .set('Origin', ORIGIN)
      .send({
        name: RULE_NAME,
        authorId,
        commissionType: 'percentage',
        commissionValue: '10',
        calculationBase: 'after_provider_fee',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      })
      .expect(201);
    ruleId = (rule.body as { id: string }).id;
  });

  afterAll(async () => {
    const userFilter = { user: { email: { endsWith: EMAIL_DOMAIN } } };
    // Filtré par acheteur (le lecteur de ce fichier), pas par `authorId` seul :
    // la Phase 3 (portée tenant) fait vendre un second auteur du même tenant,
    // et `sale_distributions.author_id` est `ON DELETE RESTRICT` — le
    // supprimer avant `author.deleteMany()` ci-dessous est indispensable pour
    // CE second auteur aussi, pas seulement le premier.
    await adminPrisma.saleDistribution.deleteMany({
      where: { orderItem: { order: userFilter } },
    });
    await adminPrisma.paymentEvent.deleteMany({
      where: { eventId: { startsWith: 'evt_phase10_' } },
    });
    await adminPrisma.payment.deleteMany({ where: { order: userFilter } });
    await prisma.readerLibrary.deleteMany({ where: userFilter });
    await adminPrisma.order.deleteMany({ where: userFilter });
    await prisma.commissionRule.deleteMany({
      where: { name: { startsWith: 'Règle phase 10' } },
    });
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'phase10-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'phase10-' } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('Figeage au moment de la vente', () => {
    it('calcule et fige la répartition dans la transaction du paiement', async () => {
      const orderNumber = await buyAndSettle();

      // brut 10 000, frais 250 (2,5 %), net 9 750, commission 10 % = 975
      const distribution = await distributionOf(orderNumber);
      expect(distribution.grossAmount.toFixed(2)).toBe('10000.00');
      expect(distribution.providerFee.toFixed(2)).toBe('250.00');
      expect(distribution.netAfterProviderFee.toFixed(2)).toBe('9750.00');
      expect(distribution.gebookCommissionAmount.toFixed(2)).toBe('975.00');
      expect(distribution.authorNetAmount.toFixed(2)).toBe('8775.00');
      expect(distribution.commissionRuleId).toBe(ruleId);
      // Phase 7 : disponible dès le figeage (aucun prestataire de
      // reversement n'existe encore pour justifier un état intermédiaire).
      expect(distribution.payoutStatus).toBe('available');
    });

    it('prend la quantité en compte', async () => {
      const orderNumber = await buyAndSettle(2);

      // brut 20 000, frais 500, net 19 500, commission 1 950
      const distribution = await distributionOf(orderNumber);
      expect(distribution.grossAmount.toFixed(2)).toBe('20000.00');
      expect(distribution.gebookCommissionAmount.toFixed(2)).toBe('1950.00');
      expect(distribution.authorNetAmount.toFixed(2)).toBe('17550.00');
    });

    it('n’enregistre qu’une seule répartition par ligne (règle n° 15)', async () => {
      const orderNumber = await buyAndSettle();
      const item = await adminPrisma.orderItem.findFirstOrThrow({
        where: { order: { orderNumber } },
      });

      // Une seconde répartition sur la même ligne doit être refusée par la base.
      await expect(
        adminPrisma.saleDistribution.create({
          data: {
            orderItemId: item.id,
            authorId,
            grossAmount: '1.00',
            providerFee: '0.00',
            netAfterProviderFee: '1.00',
            gebookCommissionAmount: '0.00',
            authorNetAmount: '1.00',
          },
        }),
      ).rejects.toThrow();

      const count = await adminPrisma.saleDistribution.count({
        where: { orderItemId: item.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('Les commissions sont figées (règles n° 13 et 14)', () => {
    it('ne modifie aucune vente passée quand la règle change', async () => {
      const orderNumber = await buyAndSettle();
      const before = await distributionOf(orderNumber);
      expect(before.gebookCommissionAmount.toFixed(2)).toBe('975.00');

      // La règle passe de 10 % à 20 %.
      await adminAgent
        .patch(`/admin/commission-rules/${ruleId}`)
        .set('Origin', ORIGIN)
        .send({ commissionValue: '20' })
        .expect(200);

      const after = await distributionOf(orderNumber);
      expect(after.gebookCommissionAmount.toFixed(2)).toBe('975.00');
      expect(after.authorNetAmount.toFixed(2)).toBe('8775.00');
      expect(after.gebookCommissionRate?.toFixed(2)).toBe('10.00');

      // La nouvelle vente, elle, applique bien le nouveau taux : 9 750 × 20 %.
      const suivante = await buyAndSettle();
      const nouvelle = await distributionOf(suivante);
      expect(nouvelle.gebookCommissionAmount.toFixed(2)).toBe('1950.00');

      await adminAgent
        .patch(`/admin/commission-rules/${ruleId}`)
        .set('Origin', ORIGIN)
        .send({ commissionValue: '10' })
        .expect(200);
    });

    it('préserve les montants lorsque la règle est supprimée (règle n° 14)', async () => {
      const rule = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} éphémère`,
          authorId,
          commissionType: 'percentage',
          commissionValue: '30',
          calculationBase: 'after_provider_fee',
          // Postérieure à la règle principale : c'est elle qui s'applique.
          effectiveFrom: '2026-02-01T00:00:00.000Z',
        })
        .expect(201);
      const ephemereId = (rule.body as { id: string }).id;

      const orderNumber = await buyAndSettle();
      const before = await distributionOf(orderNumber);
      expect(before.gebookCommissionAmount.toFixed(2)).toBe('2925.00');
      expect(before.commissionRuleId).toBe(ephemereId);

      await adminAgent
        .delete(`/admin/commission-rules/${ephemereId}`)
        .set('Origin', ORIGIN)
        .expect(204);

      const after = await distributionOf(orderNumber);
      // La référence disparaît, les montants restent : l'histoire comptable ne
      // se réécrit pas.
      expect(after.commissionRuleId).toBeNull();
      expect(after.gebookCommissionAmount.toFixed(2)).toBe('2925.00');
      expect(after.authorNetAmount.toFixed(2)).toBe('6825.00');
    });
  });

  describe('Base de calcul configurable (règle n° 16)', () => {
    it('applique le montant brut lorsque la règle le demande', async () => {
      const rule = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} brute`,
          authorId,
          commissionType: 'percentage',
          commissionValue: '10',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-03-01T00:00:00.000Z',
        })
        .expect(201);

      const orderNumber = await buyAndSettle();
      const distribution = await distributionOf(orderNumber);

      // 10 % de 10 000 (brut) = 1 000, contre 975 sur la base nette.
      expect(distribution.gebookCommissionAmount.toFixed(2)).toBe('1000.00');
      expect(distribution.authorNetAmount.toFixed(2)).toBe('8750.00');

      await adminAgent
        .delete(`/admin/commission-rules/${(rule.body as { id: string }).id}`)
        .set('Origin', ORIGIN)
        .expect(204);
    });
  });

  describe('Portée tenant / type de tenant (mission plateforme de paiement, Phase 3)', () => {
    it('refuse une règle qui cible auteur et tenant à la fois', async () => {
      const author = await adminPrisma.author.findUniqueOrThrow({
        where: { id: authorId },
        select: { tenantId: true },
      });

      const response = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} double portée`,
          authorId,
          tenantId: author.tenantId,
          commissionType: 'percentage',
          commissionValue: '5',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(400);

      expect((response.body as { message: string }).message).toContain(
        'un seul niveau',
      );
    });

    it('applique la règle propre au tenant à un auteur sans règle propre du même tenant', async () => {
      const primaryAuthor = await adminPrisma.author.findUniqueOrThrow({
        where: { id: authorId },
        select: { tenantId: true },
      });

      // Second auteur, même tenant, sans règle propre : c'est lui qui doit
      // révéler si la règle de portée tenant est vraiment appliquée par
      // `freezeForOrder`, pas seulement par la fonction pure testée à part.
      const secondAuthor = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({
          penName: `Auteur Phase 10 Tenant ${RUN_ID}`,
          slug: `phase10-auteur-tenant-${RUN_ID}`,
          status: 'active',
        })
        .expect(201);
      const secondAuthorId = (secondAuthor.body as { id: string }).id;

      const secondWork = await adminAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send({
          authorId: secondAuthorId,
          translations: { fr: { title: `Œuvre Phase 10 Tenant ${RUN_ID}` } },
          slug: `phase10-oeuvre-tenant-${RUN_ID}`,
          status: 'published',
        })
        .expect(201);

      const secondFormat = await adminAgent
        .post(`/admin/works/${(secondWork.body as { id: string }).id}/formats`)
        .set('Origin', ORIGIN)
        .send({
          formatType: 'pdf',
          price: PRICE,
          deliveryType: 'digital_download',
        })
        .expect(201);
      const secondFormatId = (secondFormat.body as { id: string }).id;

      const tenantRule = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} tenant`,
          tenantId: primaryAuthor.tenantId,
          commissionType: 'percentage',
          commissionValue: '15',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);
      const tenantRuleId = (tenantRule.body as { id: string }).id;

      const order = await readerAgent
        .post('/orders')
        .set('Origin', ORIGIN)
        .send({ items: [{ workFormatId: secondFormatId, quantity: 1 }] })
        .expect(201);
      const orderNumber = (order.body as { orderNumber: string }).orderNumber;

      const payment = await readerAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber })
        .expect(201);
      const stored = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: (payment.body as { id: string }).id },
      });

      const rawBody = Buffer.from(
        JSON.stringify({
          eventId: `evt_phase10_tenant_${RUN_ID}`,
          transactionId: stored.providerTransactionId,
          status: 'successful',
          amountMinor: PRICE_MINOR,
          feeMinor: 0,
        }),
        'utf8',
      );

      await request(app.getHttpServer())
        .post('/webhooks/fake')
        .set('Content-Type', 'application/json')
        .set(fakeDriver.signWebhook(rawBody))
        .send(rawBody.toString('utf8'))
        .expect(200);

      const distribution = await distributionOf(orderNumber);
      // 15 % de 10 000 (brut) = 1 500 — preuve que la règle de portée tenant,
      // pas la règle générale du seed, a été retenue pour ce second auteur.
      expect(distribution.commissionRuleId).toBe(tenantRuleId);
      expect(distribution.gebookCommissionAmount.toFixed(2)).toBe('1500.00');

      await adminAgent
        .delete(`/admin/commission-rules/${tenantRuleId}`)
        .set('Origin', ORIGIN)
        .expect(204);
    });
  });

  describe('Administration des règles', () => {
    it('refuse un lecteur sur les règles de commission', async () => {
      await readerAgent.get('/admin/commission-rules').expect(403);
      await readerAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: 'Tentative',
          commissionType: 'percentage',
          commissionValue: '5',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(403);
    });

    it('refuse un pourcentage supérieur à 100', async () => {
      const response = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} absurde`,
          commissionType: 'percentage',
          commissionValue: '150',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(400);

      expect((response.body as { message: string }).message).toContain('100');
    });

    it('accepte une commission fixe supérieure à 100', async () => {
      const response = await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} fixe`,
          commissionType: 'fixed',
          commissionValue: '500',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);

      await adminAgent
        .delete(
          `/admin/commission-rules/${(response.body as { id: string }).id}`,
        )
        .set('Origin', ORIGIN)
        .expect(204);
    });

    it('refuse une période dont la fin précède le début', async () => {
      await adminAgent
        .post('/admin/commission-rules')
        .set('Origin', ORIGIN)
        .send({
          name: `Règle phase 10 ${RUN_ID} inversée`,
          commissionType: 'percentage',
          commissionValue: '10',
          calculationBase: 'gross_amount',
          effectiveFrom: '2026-06-01T00:00:00.000Z',
          effectiveTo: '2026-01-01T00:00:00.000Z',
        })
        .expect(400);
    });
  });

  describe('Revenus de l’auteur', () => {
    it('refuse un compte sans fiche d’auteur rattachée', async () => {
      await readerAgent.get('/authors/me/revenue').expect(403);
    });

    it('ne montre à l’auteur que ses propres ventes, avec de vrais totaux', async () => {
      await authorAgent
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: `auteur${EMAIL_DOMAIN}`, password: 'MotDePasse1' })
        .expect(200);

      const revenue = await authorAgent.get('/authors/me/revenue').expect(200);
      const body = revenue.body as Record<string, unknown>;

      // Les totaux viennent de la base, pas d'un calcul refait ici : on vérifie
      // qu'ils concordent avec la somme des répartitions de cet auteur.
      const expected = await adminPrisma.saleDistribution.aggregate({
        where: { authorId },
        _sum: { authorNetAmount: true, gebookCommissionAmount: true },
        _count: true,
      });

      expect(body.salesCount).toBe(expected._count);
      expect(body.netTotal).toBe(expected._sum.authorNetAmount?.toFixed(2));
      expect(body.commissionTotal).toBe(
        expected._sum.gebookCommissionAmount?.toFixed(2),
      );
      expect(typeof body.netTotal).toBe('string');

      const sales = await authorAgent.get('/authors/me/sales').expect(200);
      const listed = sales.body as { data: Record<string, unknown>[] };
      expect(listed.data.length).toBeGreaterThan(0);
      expect(listed.data[0].workTitle).toBe('Œuvre Phase 10');
    });
  });

  describe('Chiffres du tableau de bord', () => {
    it('ne renvoie que des valeurs comptées en base', async () => {
      const response = await adminAgent.get('/admin/statistics').expect(200);
      const body = response.body as Record<string, unknown>;

      const publishedWorks = await adminPrisma.work.count({
        where: { status: 'published' },
      });
      const readers = await prisma.user.count();

      expect(body.publishedWorks).toBe(publishedWorks);
      expect(body.readers).toBe(readers);
      // Montants en chaînes décimales, jamais en flottants (règle n° 12).
      expect(typeof body.commissionTotal).toBe('string');
      expect(typeof body.revenueCollected).toBe('string');
    });

    it('refuse les statistiques à un lecteur', async () => {
      await readerAgent.get('/admin/statistics').expect(403);
    });
  });

  describe('Statistiques du tableau de bord (tenant, Phase 3)', () => {
    it('compte les commandes et lecteurs distincts, séparément des lignes vendues', async () => {
      const { tenantId } = await adminPrisma.author.findUniqueOrThrow({
        where: { id: authorId },
        select: { tenantId: true },
      });

      const response = await adminAgent
        .get('/admin/tenant/statistics')
        .set('Cookie', `gebook_active_tenant=${tenantId}`)
        .expect(200);

      const body = response.body as {
        salesCount: number;
        ordersCount: number;
        readersCount: number;
      };

      // Calculé indépendamment de la requête SQL du service, à partir des
      // mêmes lignes brutes — pas un simple miroir de son résultat.
      //
      // Scopé par `tenantId`, pas par `authorId` : `/admin/tenant/statistics`
      // compte TOUTES les ventes du tenant (`tenantStatistics()`, filtre
      // `orderItem: { tenantId }`), pas seulement celles d'un auteur donné.
      // Un filtre par `authorId` ne coïncidait avec le résultat de l'API que
      // tant qu'aucune autre vente n'existait dans ce tenant — un lecteur
      // achetant une œuvre d'un autre auteur du même tenant (via le site,
      // en dehors de ce test) suffit à faire diverger les deux comptages.
      const distributions = await adminPrisma.saleDistribution.findMany({
        where: { orderItem: { tenantId } },
        select: {
          orderItem: {
            select: { orderId: true, order: { select: { userId: true } } },
          },
        },
      });
      const expectedOrders = new Set(
        distributions.map((d) => d.orderItem.orderId),
      ).size;
      const expectedReaders = new Set(
        distributions.map((d) => d.orderItem.order.userId),
      ).size;

      expect(body.salesCount).toBe(distributions.length);
      expect(body.ordersCount).toBe(expectedOrders);
      expect(body.readersCount).toBe(expectedReaders);
    });

    it('refuse les statistiques de tenant à un lecteur', async () => {
      await readerAgent.get('/admin/tenant/statistics').expect(403);
    });
  });

  describe('Graphe du tableau de bord (tenant, Phase 9)', () => {
    it("la somme du graphe correspond à l'encaissé de /admin/tenant/statistics", async () => {
      const { tenantId } = await adminPrisma.author.findUniqueOrThrow({
        where: { id: authorId },
        select: { tenantId: true },
      });

      const [statsResponse, timeseriesResponse] = await Promise.all([
        adminAgent
          .get('/admin/tenant/statistics')
          .set('Cookie', `gebook_active_tenant=${tenantId}`)
          .expect(200),
        adminAgent
          .get('/admin/tenant/statistics/timeseries')
          .set('Cookie', `gebook_active_tenant=${tenantId}`)
          .expect(200),
      ]);

      const stats = statsResponse.body as { revenueCollected: string };
      const points = timeseriesResponse.body as {
        date: string;
        revenueCollected: string;
      }[];

      expect(Array.isArray(points)).toBe(true);
      const total = points.reduce(
        (sum, point) => sum + Number(point.revenueCollected),
        0,
      );
      expect(total.toFixed(2)).toBe(Number(stats.revenueCollected).toFixed(2));
    });

    it('refuse le graphe de tenant à un lecteur', async () => {
      await readerAgent.get('/admin/tenant/statistics/timeseries').expect(403);
    });
  });
});
