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
const EMAIL_DOMAIN = '@phase8.e2e.test';
const PRICE = '15000.00';
const PRICE_MINOR = 1500000;

/**
 * Préfixe unique à chaque exécution. Sans lui, les identifiants d'événement d'une
 * exécution précédente resteraient en base et la contrainte d'idempotence ferait
 * passer les notifications de la suivante pour des doublons — le test échouerait
 * pour une raison qui n'a rien à voir avec le code vérifié.
 */
const RUN_ID = randomUUID().slice(0, 8);
const EVENT_PREFIX = `evt_phase8_${RUN_ID}`;

interface WebhookBody {
  eventId: string;
  eventType?: string;
  transactionId: string;
  status: string;
  amountMinor: number;
  feeMinor?: number;
  paymentMethod?: string;
}

/**
 * Tests de la phase 8 (paiements).
 *
 * Ils s'exécutent sur la base réellement migrée : l'idempotence des notifications
 * (règle n° 8) est portée par une contrainte unique, et l'atomicité (règle n° 11)
 * par une transaction PostgreSQL. Ni l'une ni l'autre ne se vérifie avec des
 * doublures — ce sont justement les deux endroits où une erreur coûte de l'argent.
 */
describe('Paiements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let fakeDriver: FakePaymentDriver;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAAgent: ReturnType<typeof request.agent>;
  let readerBAgent: ReturnType<typeof request.agent>;
  let readerBId: string;
  let formatId: string;
  let workId: string;
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
        lastName: 'Phase8',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  };

  /** Crée une commande d'un article numérique et ouvre sa tentative de paiement. */
  const createPaidableOrder = async (
    agent: ReturnType<typeof request.agent>,
  ): Promise<{
    orderNumber: string;
    paymentId: string;
    transactionId: string;
  }> => {
    const order = await agent
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({ items: [{ workFormatId: formatId, quantity: 1 }] })
      .expect(201);
    const orderNumber = (order.body as { orderNumber: string }).orderNumber;

    const payment = await agent
      .post('/payments')
      .set('Origin', ORIGIN)
      .send({ orderNumber })
      .expect(201);
    const paymentId = (payment.body as { id: string }).id;

    const stored = await adminPrisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    return {
      orderNumber,
      paymentId,
      transactionId: stored.providerTransactionId ?? '',
    };
  };

  /** Relit l'identifiant d'un corps de notification, pour retrouver sa trace en base. */
  const eventIdOf = (rawBody: Buffer): string =>
    (JSON.parse(rawBody.toString('utf8')) as WebhookBody).eventId;

  const webhookBody = (overrides: Partial<WebhookBody>): Buffer =>
    Buffer.from(
      JSON.stringify({
        eventId: `${EVENT_PREFIX}_${(eventCounter += 1)}`,
        status: 'successful',
        amountMinor: PRICE_MINOR,
        feeMinor: 0,
        paymentMethod: 'mobile_money',
        ...overrides,
      }),
      'utf8',
    );

  /**
   * Envoie une notification comme le ferait le prestataire : corps brut, aucune
   * origine, aucun cookie. La signature est la seule preuve d'authenticité.
   */
  const postWebhook = (
    rawBody: Buffer,
    headers: Record<string, string> = fakeDriver.signWebhook(rawBody),
    providerCode = 'fake',
  ): request.Test =>
    request(app.getHttpServer())
      .post(`/webhooks/${providerCode}`)
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(rawBody.toString('utf8'));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // `rawBody` comme dans `main.ts` : sans lui, aucune signature n'est
    // vérifiable et le test ne prouverait rien de ce qui tourne en production.
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
    readerAAgent = request.agent(app.getHttpServer());
    readerBAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAAgent, `lecteur-a${EMAIL_DOMAIN}`);
    readerBId = await register(readerBAgent, `lecteur-b${EMAIL_DOMAIN}`);

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

    const author = await adminAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Phase 8',
        slug: 'phase8-auteur',
        status: 'active',
      })
      .expect(201);

    const work = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId: (author.body as { id: string }).id,
        translations: { fr: { title: 'Œuvre Phase 8' } },
        slug: 'phase8-oeuvre',
        status: 'published',
      })
      .expect(201);
    workId = (work.body as { id: string }).id;

    const format = await adminAgent
      .post(`/admin/works/${workId}/formats`)
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
    // Par préfixe et non par paiement : les notifications refusées ou ignorées
    // ne sont rattachées à aucun paiement, et resteraient sinon en base.
    await adminPrisma.paymentEvent.deleteMany({
      where: { eventId: { startsWith: 'evt_phase8_' } },
    });
    await adminPrisma.payment.deleteMany({ where: { order: userFilter } });
    await prisma.readerLibrary.deleteMany({ where: userFilter });
    // Depuis la phase 10, un paiement confirmé fige aussi une répartition. La
    // clé étrangère est en `RESTRICT` : la supprimer d'abord est obligatoire, et
    // c'est bien ce que la base doit exiger d'un code qui efface des commandes.
    await adminPrisma.saleDistribution.deleteMany({
      where: { orderItem: { order: userFilter } },
    });
    await adminPrisma.order.deleteMany({ where: userFilter });
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'phase8-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'phase8-' } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('Ouverture d’une tentative de paiement', () => {
    it('refuse un paiement non authentifié', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber: 'GB-20260101-AAAAAA' })
        .expect(401);
    });

    it('ne révèle pas la commande d’un autre lecteur (404, jamais 403)', async () => {
      const order = await readerAAgent
        .post('/orders')
        .set('Origin', ORIGIN)
        .send({ items: [{ workFormatId: formatId, quantity: 1 }] })
        .expect(201);

      await readerBAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({
          orderNumber: (order.body as { orderNumber: string }).orderNumber,
        })
        .expect(404);
    });

    it('ouvre une tentative et fait passer la commande en attente de paiement', async () => {
      const order = await readerAAgent
        .post('/orders')
        .set('Origin', ORIGIN)
        .send({ items: [{ workFormatId: formatId, quantity: 1 }] })
        .expect(201);
      const orderNumber = (order.body as { orderNumber: string }).orderNumber;

      const response = await readerAAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber })
        .expect(201);

      const body = response.body as Record<string, unknown>;
      expect(body.providerCode).toBe('fake');
      expect(body.status).toBe('pending');
      // Règle n° 12 : un montant ne circule jamais en nombre flottant.
      expect(body.expectedAmount).toBe(PRICE);
      expect(typeof body.expectedAmount).toBe('string');
      // Aucune donnée interne ne sort du DTO.
      expect(body).not.toHaveProperty('idempotencyKey');
      expect(body).not.toHaveProperty('providerTransactionId');
      expect(body).not.toHaveProperty('rawResponse');

      const stored = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(stored.status).toBe('awaiting_payment');
    });

    it('réutilise la tentative en cours plutôt que d’en empiler une seconde', async () => {
      const { orderNumber, paymentId } =
        await createPaidableOrder(readerAAgent);

      const second = await readerAAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber })
        .expect(201);

      expect((second.body as { id: string }).id).toBe(paymentId);
    });

    it('refuse un prestataire inconnu ou sans pilote installé', async () => {
      const { orderNumber } = await createPaidableOrder(readerAAgent);

      // `chariow` existe en base mais reste inactif tant que son pilote n'est
      // pas écrit (phase 8b) : le lecteur ne doit pas pouvoir le choisir.
      await readerAAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber, providerCode: 'chariow' })
        .expect(400);
    });
  });

  describe('Notifications refusées', () => {
    it('refuse une notification d’un prestataire inconnu', async () => {
      await postWebhook(
        webhookBody({ transactionId: 'fake_tx_inconnu' }),
        undefined,
        'prestataire_inexistant',
      ).expect(404);
    });

    it('enregistre puis refuse une notification mal signée sans rien modifier (règle n° 9)', async () => {
      const { paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);
      const rawBody = webhookBody({ transactionId });
      const headers = fakeDriver.signWebhook(rawBody);

      await postWebhook(rawBody, {
        ...headers,
        'x-gebook-signature': 'f'.repeat(64),
      }).expect(400);

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe('pending');

      // Enregistrer avant de traiter : la trace existe même si le message est
      // rejeté, seule façon de diagnostiquer une attaque (audit §33, règle 1).
      const event = await adminPrisma.paymentEvent.findFirstOrThrow({
        where: { eventId: eventIdOf(rawBody) },
      });
      expect(event.signatureValid).toBe(false);
      expect(event.processingStatus).toBe('failed');
      expect(event.errorMessage).toContain('Signature');
    });

    it('refuse une notification rejouée hors de la fenêtre de tolérance', async () => {
      const { paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);
      const rawBody = webhookBody({ transactionId });
      const old = Math.floor(Date.now() / 1000) - 3600;

      await postWebhook(rawBody, fakeDriver.signWebhook(rawBody, old)).expect(
        400,
      );

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe('pending');
    });

    it('refuse un montant différent du montant attendu (règle n° 10)', async () => {
      const { paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);
      const rawBody = webhookBody({ transactionId, amountMinor: 100 });

      await postWebhook(rawBody).expect(400);

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe('pending');
      expect(payment.paidAmount).toBeNull();

      const event = await adminPrisma.paymentEvent.findFirstOrThrow({
        where: { eventId: eventIdOf(rawBody) },
      });
      expect(event.processingStatus).toBe('failed');
      expect(event.errorMessage).toContain('Montant');
    });

    it('accuse réception d’une transaction inconnue sans rien traiter', async () => {
      const rawBody = webhookBody({ transactionId: 'fake_tx_jamais_ouverte' });

      await postWebhook(rawBody).expect(200);

      const event = await adminPrisma.paymentEvent.findFirstOrThrow({
        where: { eventId: eventIdOf(rawBody) },
      });
      expect(event.processingStatus).toBe('ignored');
      expect(event.paymentId).toBeNull();
    });
  });

  describe('Paiement confirmé', () => {
    let orderNumber: string;
    let paymentId: string;
    let transactionId: string;

    beforeAll(async () => {
      ({ orderNumber, paymentId, transactionId } =
        await createPaidableOrder(readerAAgent));
    });

    it('confirme le paiement, la commande et l’accès du lecteur en une seule fois', async () => {
      const rawBody = webhookBody({ transactionId, feeMinor: 25000 });

      await postWebhook(rawBody).expect(200);

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe('successful');
      expect(payment.paidAmount?.toFixed(2)).toBe(PRICE);
      expect(payment.providerFee?.toFixed(2)).toBe('250.00');
      expect(payment.paidAt).not.toBeNull();

      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
        include: { items: true },
      });
      expect(order.status).toBe('paid');
      expect(order.paidAt).not.toBeNull();

      // Le droit d'accès naît du paiement et vit dans `reader_library`, jamais
      // dans `orders` (règle n° 17).
      const library = await prisma.readerLibrary.findMany({
        where: { orderItemId: { in: order.items.map((item) => item.id) } },
      });
      expect(library).toHaveLength(1);
      expect(library[0].accessStatus).toBe('active');
    });

    it('ne produit qu’un seul effet lorsque la même notification arrive trois fois (règle n° 8)', async () => {
      const rawBody = webhookBody({
        eventId: `${EVENT_PREFIX}_idempotence`,
        transactionId,
      });

      // La première a déjà été traitée par le test précédent : on rejoue
      // exactement le même événement trois fois de plus.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await postWebhook(rawBody).expect(200);
      }

      const events = await adminPrisma.paymentEvent.count({
        where: { eventId: `${EVENT_PREFIX}_idempotence` },
      });
      expect(events).toBe(1);

      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
        include: { items: true },
      });
      const library = await prisma.readerLibrary.count({
        where: { orderItemId: { in: order.items.map((item) => item.id) } },
      });
      expect(library).toBe(1);
    });

    it('ignore un nouvel événement portant sur un paiement déjà confirmé', async () => {
      const rawBody = webhookBody({ transactionId });

      await postWebhook(rawBody).expect(200);

      const event = await adminPrisma.paymentEvent.findFirstOrThrow({
        where: { eventId: eventIdOf(rawBody) },
      });
      expect(event.processingStatus).toBe('ignored');
    });

    it('refuse une nouvelle tentative de paiement sur une commande réglée', async () => {
      await readerAAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber })
        .expect(400);
    });
  });

  describe('Échec puis nouvelle tentative (règle n° 7)', () => {
    it('conserve les deux tentatives et laisse le lecteur réessayer', async () => {
      const { orderNumber, paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);

      await postWebhook(
        webhookBody({ transactionId, status: 'failed' }),
      ).expect(200);

      const failed = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(failed.status).toBe('failed');

      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(order.status).toBe('failed');

      // Une seconde tentative doit être possible : la commande reste payable.
      const retry = await readerAAgent
        .post('/payments')
        .set('Origin', ORIGIN)
        .send({ orderNumber })
        .expect(201);
      expect((retry.body as { id: string }).id).not.toBe(paymentId);

      const attempts = await adminPrisma.payment.count({
        where: { order: { orderNumber } },
      });
      expect(attempts).toBe(2);

      const listed = await readerAAgent
        .get(`/orders/${orderNumber}/payments`)
        .expect(200);
      expect(listed.body).toHaveLength(2);
    });
  });

  describe('Remboursement', () => {
    /** Règle une commande et rend son identifiant, prêt à être remboursé. */
    const settledOrder = async (): Promise<{
      orderId: string;
      orderNumber: string;
      paymentId: string;
    }> => {
      const { orderNumber, paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);
      await postWebhook(webhookBody({ transactionId })).expect(200);
      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });

      return { orderId: order.id, orderNumber, paymentId };
    };

    it('refuse le remboursement à un lecteur', async () => {
      const { orderId } = await settledOrder();

      await readerAAgent
        .post(`/admin/orders/${orderId}/refund`)
        .set('Origin', ORIGIN)
        .send({})
        .expect(403);
    });

    it('refuse de rembourser une commande sans paiement confirmé', async () => {
      const { orderNumber } = await createPaidableOrder(readerAAgent);
      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });

      await adminAgent
        .post(`/admin/orders/${order.id}/refund`)
        .set('Origin', ORIGIN)
        .send({})
        .expect(400);
    });

    it('refuse le remboursement lorsque le prestataire ne le gère pas', async () => {
      const { orderId } = await settledOrder();

      // La capacité est déclarée en base : un administrateur peut la retirer
      // sans redéploiement, et le code doit en tenir compte.
      await prisma.paymentProvider.update({
        where: { code: 'fake' },
        data: { supportsRefund: false },
      });

      try {
        await adminAgent
          .post(`/admin/orders/${orderId}/refund`)
          .set('Origin', ORIGIN)
          .send({})
          .expect(400);

        const payment = await adminPrisma.payment.findFirstOrThrow({
          where: { orderId },
        });
        expect(payment.status).toBe('successful');
      } finally {
        await prisma.paymentProvider.update({
          where: { code: 'fake' },
          data: { supportsRefund: true },
        });
      }
    });

    it('rembourse, révoque l’accès du lecteur et conserve l’historique (règles n° 6 et 18)', async () => {
      const { orderId, orderNumber, paymentId } = await settledOrder();

      // Filtre imbriqué sur `orderItem` (RLS) : contexte admin nécessaire.
      const before = await adminPrisma.readerLibrary.findFirstOrThrow({
        where: { orderItem: { orderId } },
      });
      expect(before.accessStatus).toBe('active');

      const response = await adminAgent
        .post(`/admin/orders/${orderId}/refund`)
        .set('Origin', ORIGIN)
        .send({ reason: 'Ouvrage indisponible' })
        .expect(200);
      expect((response.body as { status: string }).status).toBe('refunded');

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.status).toBe('refunded');

      // Filtre imbriqué sur `orderItem` (RLS) : nécessite le contexte admin,
      // même si `reader_library` elle-même n'est pas protégée par RLS.
      const access = await adminPrisma.readerLibrary.findFirstOrThrow({
        where: { orderItem: { orderId } },
      });
      expect(access.accessStatus).toBe('revoked');
      expect(access.revokedAt).not.toBeNull();

      // L'accès est révoqué, pas supprimé : la commande et ses instantanés
      // restent lisibles pour la comptabilité et le service client.
      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
        include: { items: true },
      });
      expect(order.status).toBe('refunded');
      expect(order.paidAt).not.toBeNull();
      expect(order.items[0].unitPrice.toFixed(2)).toBe(PRICE);

      // Le motif est journalisé : c'est la seule trace de la raison du mouvement.
      const log = await adminPrisma.activityLog.findFirstOrThrow({
        where: { action: 'admin.order.refund', entityId: orderId },
      });
      expect(log.description).toBe('Ouvrage indisponible');
    });

    it('refuse un second remboursement de la même commande', async () => {
      const { orderId } = await settledOrder();

      await adminAgent
        .post(`/admin/orders/${orderId}/refund`)
        .set('Origin', ORIGIN)
        .send({})
        .expect(200);

      await adminAgent
        .post(`/admin/orders/${orderId}/refund`)
        .set('Origin', ORIGIN)
        .send({})
        .expect(400);
    });

    it('refuse de marquer une commande « remboursée » par un simple changement de statut', async () => {
      const { orderId } = await settledOrder();

      await adminAgent
        .patch(`/admin/orders/${orderId}/status`)
        .set('Origin', ORIGIN)
        .send({ status: 'refunded' })
        .expect(400);

      // Ni le paiement ni l'accès du lecteur n'ont bougé.
      const payment = await adminPrisma.payment.findFirstOrThrow({
        where: { orderId },
      });
      // Filtre imbriqué sur `orderItem` (RLS) : nécessite le contexte admin,
      // même si `reader_library` elle-même n'est pas protégée par RLS.
      const access = await adminPrisma.readerLibrary.findFirstOrThrow({
        where: { orderItem: { orderId } },
      });
      expect(payment.status).toBe('successful');
      expect(access.accessStatus).toBe('active');
    });
  });

  describe('Atomicité des opérations financières (règle n° 11)', () => {
    it('n’enregistre aucun paiement réussi si le droit d’accès ne peut pas être créé', async () => {
      const { orderNumber, paymentId, transactionId } =
        await createPaidableOrder(readerAAgent);

      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
        include: { items: true },
      });

      // Panne provoquée à l'étape « bibliothèque » : une autre ligne revendique
      // déjà cet achat, ce que la contrainte unique sur `order_item_id` refuse.
      await prisma.readerLibrary.create({
        data: {
          userId: readerBId,
          orderItemId: order.items[0].id,
          workId: order.items[0].workId,
          workFormatId: order.items[0].workFormatId,
        },
      });

      await postWebhook(webhookBody({ transactionId })).expect(500);

      const payment = await adminPrisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      const unchanged = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });

      // Ni paiement confirmé, ni commande réglée : tout ou rien.
      expect(payment.status).toBe('pending');
      expect(payment.paidAt).toBeNull();
      expect(unchanged.status).toBe('awaiting_payment');
      expect(unchanged.paidAt).toBeNull();
    });
  });

  describe('Règlement simulé', () => {
    it('refuse de simuler le règlement d’un paiement qui n’appartient pas au lecteur', async () => {
      const { paymentId } = await createPaidableOrder(readerAAgent);

      await readerBAgent
        .post(`/payments/${paymentId}/simulate`)
        .set('Origin', ORIGIN)
        .send({ outcome: 'successful' })
        .expect(404);
    });

    it('règle la commande en passant par le chemin de notification réel', async () => {
      const { orderNumber, paymentId } =
        await createPaidableOrder(readerAAgent);

      await readerAAgent
        .post(`/payments/${paymentId}/simulate`)
        .set('Origin', ORIGIN)
        .send({ outcome: 'successful' })
        .expect(200);

      const order = await adminPrisma.order.findUniqueOrThrow({
        where: { orderNumber },
      });
      expect(order.status).toBe('paid');

      // La simulation produit une vraie notification signée, enregistrée comme
      // telle : aucun raccourci ne contourne la vérification.
      const event = await adminPrisma.paymentEvent.findFirstOrThrow({
        where: { paymentId },
      });
      expect(event.signatureValid).toBe(true);
      expect(event.processingStatus).toBe('processed');
    });

    it('refuse une issue de simulation inconnue', async () => {
      const { paymentId } = await createPaidableOrder(readerAAgent);

      await readerAAgent
        .post(`/payments/${paymentId}/simulate`)
        .set('Origin', ORIGIN)
        .send({ outcome: 'gratuit' })
        .expect(400);
    });
  });
});
