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
import { MailService } from './../src/modules/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminPrismaProxy } from './support/admin-db';
import { fakeMailService } from './support/fake-mail';
import { verifyAndLogin } from './support/verify-and-login';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase-payouts.e2e.test';
const PRICE = '12000.00';
const PRICE_MINOR = 1200000;
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Tests de retrait (`PayoutsService.request`).
 *
 * Corrige un défaut relevé à l'audit FeexPay (CRITIQUE) : l'ancienne version
 * lisait les lignes de vente disponibles HORS transaction puis les
 * revendiquait par id, sans revérifier `payoutId: null` au moment de
 * l'écriture — deux demandes concurrentes pouvaient revendiquer deux fois le
 * même solde. Comme pour les paiements (`payments.e2e-spec.ts`), ce
 * comportement ne se vérifie pas avec des doublures : seule une vraie
 * transaction PostgreSQL, sous une vraie concurrence, peut le démontrer.
 */
describe('Retraits (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let fakeDriver: FakePaymentDriver;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;
  let tenantId: string;
  let formatId: string;
  let eventCounter = 0;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<string> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Payouts',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);

    await verifyAndLogin(agent, prisma, ORIGIN, email, mail.sent);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return user.id;
  };

  /** Achète et règle réellement : seule une vraie vente rend un solde retirable. */
  const buyAndSettle = async (): Promise<string> => {
    const order = await readerAgent
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({ items: [{ workFormatId: formatId, quantity: 1 }] })
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
        eventId: `evt_payouts_${RUN_ID}_${(eventCounter += 1)}`,
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

    return orderNumber;
  };

  const requestPayout = () =>
    adminAgent.post('/admin/tenant/payouts').set('Origin', ORIGIN).send({
      beneficiaryName: 'Auteur Test',
      beneficiaryCountry: 'CG',
      beneficiaryAccount: '+242060000000',
      method: 'mobile_money',
    });

  const mail = fakeMailService();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

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

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAgent, `lecteur${EMAIL_DOMAIN}`);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    // Platform_admin ET owner du tenant, comme dans `commissions.e2e-spec.ts` :
    // seul un platform_admin satisfait la policy RLS `sale_distributions_update`
    // (restreinte à `app_is_platform_admin()`) que `request()` doit franchir
    // pour revendiquer les lignes disponibles.
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });
    await prisma.loginAttempt.deleteMany({});

    await adminAgent
      .post('/tenants')
      .set('Origin', ORIGIN)
      .send({
        name: 'Phase Payouts (test)',
        slug: 'phase-payouts-tenant',
        type: 'independent_author',
        acceptTerms: true,
      })
      .expect(201);

    const tenant = await adminPrisma.tenant.findUniqueOrThrow({
      where: { slug: 'phase-payouts-tenant' },
    });
    tenantId = tenant.id;

    const author = await adminAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Payouts',
        slug: 'phase-payouts-auteur',
        status: 'active',
      })
      .expect(201);

    const work = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId: (author.body as { id: string }).id,
        translations: { fr: { title: 'Œuvre Payouts' } },
        slug: 'phase-payouts-oeuvre',
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
  });

  afterAll(async () => {
    const userFilter = { user: { email: { endsWith: EMAIL_DOMAIN } } };
    await adminPrisma.saleDistribution.deleteMany({
      where: { orderItem: { order: userFilter } },
    });
    await adminPrisma.payout.deleteMany({ where: { tenantId } });
    await adminPrisma.paymentEvent.deleteMany({
      where: { eventId: { startsWith: 'evt_payouts_' } },
    });
    await adminPrisma.payment.deleteMany({ where: { order: userFilter } });
    await prisma.readerLibrary.deleteMany({ where: userFilter });
    await adminPrisma.order.deleteMany({ where: userFilter });
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'phase-payouts-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'phase-payouts-' } },
    });
    await adminPrisma.tenantMember.deleteMany({
      where: { tenant: { slug: 'phase-payouts-tenant' } },
    });
    await adminPrisma.tenant.deleteMany({
      where: { slug: 'phase-payouts-tenant' },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('Demande de retrait (nominal)', () => {
    it('revendique la totalité du solde disponible en une seule demande', async () => {
      await buyAndSettle();

      const balance = await adminAgent
        .get('/admin/tenant/payouts/balance')
        .set('Origin', ORIGIN)
        .expect(200);
      const expectedTotal = (balance.body as { availableBalance: string })
        .availableBalance;
      expect(Number(expectedTotal)).toBeGreaterThan(0);

      const response = await requestPayout().expect(201);
      const payout = response.body as { id: string; amount: string };
      expect(payout.amount).toBe(expectedTotal);

      // Le solde est intégralement consommé : plus rien à revendiquer.
      const balanceAfter = await adminAgent
        .get('/admin/tenant/payouts/balance')
        .set('Origin', ORIGIN)
        .expect(200);
      expect(
        (balanceAfter.body as { availableBalance: string }).availableBalance,
      ).toBe('0.00');

      const claimed = await adminPrisma.saleDistribution.findMany({
        where: { author: { tenantId }, payoutId: payout.id },
      });
      expect(claimed.length).toBeGreaterThan(0);
    });

    // Enchaîne volontairement sur l'état laissé par le test précédent (solde
    // entièrement revendiqué, donc nul) plutôt que d'en recréer un : c'est
    // exactement la situation qu'une seconde demande doit refuser.
    it("refuse une demande quand aucun solde n'est disponible", async () => {
      const balance = await adminAgent
        .get('/admin/tenant/payouts/balance')
        .set('Origin', ORIGIN)
        .expect(200);
      expect(
        (balance.body as { availableBalance: string }).availableBalance,
      ).toBe('0.00');

      const response = await requestPayout().expect(400);
      expect((response.body as { message: string }).message).toContain(
        'Aucun montant disponible',
      );
    });
  });

  describe('Concurrence (audit FeexPay — écart CRITIQUE corrigé)', () => {
    it('empêche deux demandes concurrentes de revendiquer le même solde', async () => {
      const orderNumber = await buyAndSettle();

      const balance = await adminAgent
        .get('/admin/tenant/payouts/balance')
        .set('Origin', ORIGIN)
        .expect(200);
      const expectedTotal = (balance.body as { availableBalance: string })
        .availableBalance;
      expect(Number(expectedTotal)).toBeGreaterThan(0);

      // Compté avant, pas supposé nul : le test précédent de ce fichier a
      // déjà laissé un `Payout` `pending` pour ce même tenant (volontairement,
      // pour enchaîner sur un solde nul — voir plus haut). Seul le delta
      // compte ici, pas le total.
      const payoutsBefore = await adminPrisma.payout.count({
        where: { tenantId },
      });

      // Deux requêtes HTTP réellement concurrentes contre le même serveur —
      // pas un appel de service simulé — pour engager la vraie transaction
      // PostgreSQL des deux côtés en même temps.
      const [first, second] = await Promise.all([
        requestPayout(),
        requestPayout(),
      ]);

      const results = [first, second];
      const succeeded = results.filter((r) => r.status === 201);
      const rejected = results.filter((r) => r.status === 400);

      // La correction doit laisser passer EXACTEMENT une des deux demandes :
      // avant elle, les deux réussissaient et revendiquaient deux fois le
      // même solde (double engagement de paiement pour l'auteur).
      expect(succeeded.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0].body as { message: string }).message).toContain(
        'Aucun montant disponible',
      );

      const winner = succeeded[0].body as { id: string; amount: string };
      expect(winner.amount).toBe(expectedTotal);

      // Un seul `Payout` a réellement été créé par CETTE demande concurrente :
      // celui de la branche rejetée n'a jamais persisté (roulé en arrière
      // avec sa transaction), pas seulement laissé à un montant nul.
      const payoutsAfter = await adminPrisma.payout.findMany({
        where: { tenantId },
        orderBy: { requestedAt: 'asc' },
      });
      expect(payoutsAfter.length).toBe(payoutsBefore + 1);
      expect(payoutsAfter[payoutsAfter.length - 1].id).toBe(winner.id);

      // La ligne de vente créée par CET achat n'a été revendiquée qu'une
      // fois, par le gagnant — jamais par les deux (scopé à `orderNumber` :
      // le tenant porte aussi la ligne, déjà revendiquée, du test précédent).
      const distribution = await adminPrisma.saleDistribution.findFirstOrThrow({
        where: { orderItem: { order: { orderNumber } } },
      });
      expect(distribution.payoutId).toBe(winner.id);
      expect(distribution.authorNetAmount.toFixed(2)).toBe(expectedTotal);
    });
  });
});
