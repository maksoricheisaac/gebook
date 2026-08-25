import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminDb } from './support/admin-db';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase7.e2e.test';

/**
 * Ces tests s'exécutent sur la base réellement migrée, comme ceux du catalogue et
 * du back-office : la règle n° 6 (instantané figé) et l'isolation entre lecteurs
 * dépendent de contraintes et d'un comportement de transaction réels, pas
 * simplement du typage TypeScript.
 */
describe('Commandes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAAgent: ReturnType<typeof request.agent>;
  let readerBAgent: ReturnType<typeof request.agent>;
  let formatId: string;
  let workId: string;
  let authorId: string;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Phase7',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
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
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });

    adminAgent = request.agent(app.getHttpServer());
    readerAAgent = request.agent(app.getHttpServer());
    readerBAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    const readerAEmail = `lecteur-a${EMAIL_DOMAIN}`;
    const readerBEmail = `lecteur-b${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAAgent, readerAEmail);
    await register(readerBAgent, readerBEmail);

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

    // Œuvre publiée d'un auteur actif : seule condition sous laquelle un format est
    // achetable (le filtre de visibilité publique s'applique aussi aux commandes).
    const author = await adminAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Phase 7',
        slug: 'phase7-auteur',
        status: 'active',
      })
      .expect(201);
    authorId = (author.body as { id: string }).id;

    const work = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        translations: { fr: { title: 'Œuvre Phase 7' } },
        slug: 'phase7-oeuvre',
        status: 'published',
      })
      .expect(201);
    workId = (work.body as { id: string }).id;

    const format = await adminAgent
      .post(`/admin/works/${workId}/formats`)
      .set('Origin', ORIGIN)
      .send({
        formatType: 'pdf',
        price: '4500.00',
        deliveryType: 'digital_download',
      })
      .expect(201);
    formatId = (format.body as { id: string }).id;
  });

  afterAll(async () => {
    await adminDb(prisma, (tx) =>
      tx.order.deleteMany({
        where: { user: { email: { endsWith: EMAIL_DOMAIN } } },
      }),
    );
    await adminDb(prisma, (tx) =>
      tx.work.deleteMany({ where: { slug: { startsWith: 'phase7-' } } }),
    );
    await adminDb(prisma, (tx) =>
      tx.author.deleteMany({ where: { slug: { startsWith: 'phase7-' } } }),
    );
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  it('refuse une commande non authentifiée', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({ items: [{ workFormatId: formatId, quantity: 1 }] })
      .expect(401);
  });

  it('refuse un format inexistant ou non publié (visibilité publique)', async () => {
    await readerAAgent
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({
        items: [
          { workFormatId: '00000000-0000-7000-8000-000000000000', quantity: 1 },
        ],
      })
      .expect(404);
  });

  it("n'enregistre aucune commande partielle quand un article de la liste est invalide (transaction)", async () => {
    // Décompte restreint aux comptes de cette suite : les suites e2e partagent la
    // même base et s'exécutent en parallèle, un total global compterait aussi les
    // commandes créées au même instant par une autre suite.
    const ownOrders = {
      where: { user: { email: { endsWith: EMAIL_DOMAIN } } },
    };
    const countBefore = await adminDb(prisma, (tx) =>
      tx.order.count(ownOrders),
    );

    await readerAAgent
      .post('/orders')
      .set('Origin', ORIGIN)
      .send({
        items: [
          { workFormatId: formatId, quantity: 1 },
          { workFormatId: '00000000-0000-7000-8000-000000000000', quantity: 1 },
        ],
      })
      .expect(404);

    const countAfter = await adminDb(prisma, (tx) => tx.order.count(ownOrders));
    expect(countAfter).toBe(countBefore);
  });

  describe('Cycle de vie d’une commande', () => {
    let orderNumber: string;
    let orderId: string;

    it('crée une commande avec des instantanés de prix et de libellé (règle n° 6)', async () => {
      const response = await readerAAgent
        .post('/orders')
        .set('Origin', ORIGIN)
        .send({ items: [{ workFormatId: formatId, quantity: 2 }] })
        .expect(201);

      const body = response.body as {
        orderNumber: string;
        id: string;
        status: string;
        subtotal: string;
        totalAmount: string;
        items: Array<{
          workTitle: string;
          authorName: string;
          formatType: string;
          unitPrice: string;
          quantity: number;
          lineTotal: string;
        }>;
      };

      orderNumber = body.orderNumber;
      orderId = body.id;

      expect(orderNumber).toMatch(/^GB-\d{8}-[A-Z0-9]{6}$/);
      expect(body.status).toBe('pending');
      expect(body.items).toHaveLength(1);
      expect(body.items[0].workTitle).toBe('Œuvre Phase 7');
      expect(body.items[0].authorName).toBe('Auteur Phase 7');
      expect(body.items[0].formatType).toBe('pdf');
      expect(body.items[0].unitPrice).toBe('4500.00');
      expect(body.items[0].quantity).toBe(2);
      expect(body.items[0].lineTotal).toBe('9000.00');
      expect(body.subtotal).toBe('9000.00');
      expect(body.totalAmount).toBe('9000.00');
    });

    it('conserve les instantanés inchangés après une modification du prix du format', async () => {
      await adminAgent
        .patch(`/admin/works/${workId}/formats/${formatId}`)
        .set('Origin', ORIGIN)
        .send({ price: '9999.00' })
        .expect(200);

      const response = await readerAAgent
        .get(`/orders/${orderNumber}`)
        .expect(200);

      const body = response.body as {
        items: Array<{ unitPrice: string; lineTotal: string }>;
        subtotal: string;
      };

      expect(body.items[0].unitPrice).toBe('4500.00');
      expect(body.items[0].lineTotal).toBe('9000.00');
      expect(body.subtotal).toBe('9000.00');
    });

    it("n'est visible ni dans la liste ni en détail pour un autre lecteur", async () => {
      await readerBAgent.get(`/orders/${orderNumber}`).expect(404);

      const list = await readerBAgent.get('/orders/me').expect(200);
      const body = list.body as { data: Array<{ orderNumber: string }> };
      expect(body.data.some((order) => order.orderNumber === orderNumber)).toBe(
        false,
      );
    });

    it('apparaît dans l’historique du lecteur propriétaire', async () => {
      const list = await readerAAgent.get('/orders/me').expect(200);
      const body = list.body as { data: Array<{ orderNumber: string }> };
      expect(body.data.some((order) => order.orderNumber === orderNumber)).toBe(
        true,
      );
    });

    it("est invisible pour un lecteur sur la liste d'administration (contrôle d'accès)", async () => {
      await readerAAgent.get('/admin/orders').expect(403);
    });

    it('apparaît dans la liste d’administration', async () => {
      const list = await adminAgent.get('/admin/orders').expect(200);
      const body = list.body as { data: Array<{ orderNumber: string }> };
      expect(body.data.some((order) => order.orderNumber === orderNumber)).toBe(
        true,
      );
    });

    it('refuse une transition de statut invalide', async () => {
      await adminAgent
        .patch(`/admin/orders/${orderId}/status`)
        .set('Origin', ORIGIN)
        .send({ status: 'delivered' })
        .expect(400);
    });

    it('accepte une transition de statut valide', async () => {
      await adminAgent
        .patch(`/admin/orders/${orderId}/status`)
        .set('Origin', ORIGIN)
        .send({ status: 'awaiting_payment' })
        .expect(200);

      const response = await readerAAgent
        .get(`/orders/${orderNumber}`)
        .expect(200);
      expect((response.body as { status: string }).status).toBe(
        'awaiting_payment',
      );
    });
  });
});
