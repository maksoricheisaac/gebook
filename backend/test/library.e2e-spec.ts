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
import { VirusScanService } from './../src/modules/files/virus-scan.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminPrismaProxy } from './support/admin-db';
import { fakeVirusScanner } from './support/fake-virus-scanner';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase9.e2e.test';
const PRICE = '8000.00';
const PRICE_MINOR = 800000;
const RUN_ID = randomUUID().slice(0, 8);

const PDF_BYTES = Buffer.from('%PDF-1.4\n%contenu de test phase 9\n');
const SAMPLE_BYTES = Buffer.from('%PDF-1.4\n%extrait gratuit phase 9\n');

/**
 * Tests de la phase 9 (bibliothèque et téléchargement).
 *
 * Ils vérifient les règles n° 17 à 21 sur la base réelle : le droit d'accès vient
 * de `reader_library` et de nulle part ailleurs, un lecteur ne peut pas atteindre
 * l'ouvrage d'un autre, un accès révoqué ferme immédiatement la porte, et aucun
 * fichier ne sort jamais d'une route statique.
 */
describe('Bibliothèque (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let fakeDriver: FakePaymentDriver;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAAgent: ReturnType<typeof request.agent>;
  let readerBAgent: ReturnType<typeof request.agent>;
  let workId: string;
  let workSlug: string;
  let formatId: string;
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
        lastName: 'Phase9',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  };

  /**
   * Achète et règle réellement l'ouvrage : le droit d'accès doit naître du
   * paiement, jamais d'une insertion directe en base — sinon le test ne
   * prouverait rien du parcours réel.
   */
  const buyAndSettle = async (
    agent: ReturnType<typeof request.agent>,
  ): Promise<string> => {
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
    const stored = await adminPrisma.payment.findUniqueOrThrow({
      where: { id: (payment.body as { id: string }).id },
    });

    const rawBody = Buffer.from(
      JSON.stringify({
        eventId: `evt_phase9_${RUN_ID}_${(eventCounter += 1)}`,
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

    // Filtre imbriqué sur `orderItem`/`order` (RLS) : contexte admin nécessaire.
    const entry = await adminPrisma.readerLibrary.findFirstOrThrow({
      where: { orderItem: { order: { orderNumber } } },
    });

    return entry.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VirusScanService)
      .useValue(fakeVirusScanner())
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
    readerAAgent = request.agent(app.getHttpServer());
    readerBAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAAgent, `lecteur-a${EMAIL_DOMAIN}`);
    await register(readerBAgent, `lecteur-b${EMAIL_DOMAIN}`);

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
        penName: 'Auteur Phase 9',
        slug: 'phase9-auteur',
        status: 'active',
      })
      .expect(201);

    workSlug = 'phase9-oeuvre';
    const work = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId: (author.body as { id: string }).id,
        translations: { fr: { title: 'Œuvre Phase 9' } },
        slug: workSlug,
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

    await adminAgent
      .post(`/admin/works/${workId}/formats/${formatId}/file`)
      .set('Origin', ORIGIN)
      .attach('file', PDF_BYTES, {
        filename: 'livre.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  });

  afterAll(async () => {
    const userFilter = { user: { email: { endsWith: EMAIL_DOMAIN } } };
    await prisma.download.deleteMany({ where: userFilter });
    await adminPrisma.paymentEvent.deleteMany({
      where: { eventId: { startsWith: 'evt_phase9_' } },
    });
    await adminPrisma.payment.deleteMany({ where: { order: userFilter } });
    await prisma.readerLibrary.deleteMany({ where: userFilter });
    // Voir `payments.e2e-spec` : les répartitions figées par le paiement sont en
    // `RESTRICT`, elles se suppriment avant les commandes.
    await adminPrisma.saleDistribution.deleteMany({
      where: { orderItem: { order: userFilter } },
    });
    await adminPrisma.order.deleteMany({ where: userFilter });
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: 'phase9-' } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: 'phase9-' } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('Consultation de la bibliothèque', () => {
    it('refuse un accès non authentifié', async () => {
      await request(app.getHttpServer()).get('/library').expect(401);
    });

    it('n’expose jamais l’emplacement du fichier sur le disque (règle n° 19)', async () => {
      await buyAndSettle(readerAAgent);

      const response = await readerAAgent.get('/library').expect(200);
      const body = response.body as { data: Record<string, unknown>[] };

      expect(body.data.length).toBeGreaterThan(0);
      const entry = body.data[0];
      expect(entry.workTitle).toBe('Œuvre Phase 9');
      expect(entry.isDownloadable).toBe(true);
      expect(entry).not.toHaveProperty('storagePath');
      expect(entry).not.toHaveProperty('storedName');
      expect(JSON.stringify(body)).not.toContain('storage/');
    });

    it('ne montre à un lecteur que sa propre bibliothèque', async () => {
      const response = await readerBAgent.get('/library').expect(200);

      expect((response.body as { data: unknown[] }).data).toHaveLength(0);
    });
  });

  describe('Téléchargement', () => {
    it('sert le fichier au lecteur qui l’a acheté et journalise l’opération (règle n° 20)', async () => {
      const libraryId = await buyAndSettle(readerAAgent);

      const response = await readerAAgent
        .get(`/library/${libraryId}/download`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      // Le nom proposé vient du titre, jamais du nom aléatoire du disque.
      expect(response.headers['content-disposition']).toContain(
        'oeuvre-phase-9',
      );
      expect(response.body).toEqual(PDF_BYTES);

      await readerAAgent.get(`/library/${libraryId}/download`).expect(200);

      const downloads = await prisma.download.count({ where: { libraryId } });
      expect(downloads).toBe(2);
    });

    it('ne laisse pas le lecteur B télécharger l’ouvrage du lecteur A (404, jamais 403)', async () => {
      const libraryId = await buyAndSettle(readerAAgent);

      // 404 : l'existence même de l'entrée ne doit pas être confirmée.
      await readerBAgent.get(`/library/${libraryId}/download`).expect(404);

      const downloads = await prisma.download.count({ where: { libraryId } });
      expect(downloads).toBe(0);
    });

    it('refuse le téléchargement dès que l’accès est révoqué (règle n° 18)', async () => {
      const libraryId = await buyAndSettle(readerAAgent);
      await readerAAgent.get(`/library/${libraryId}/download`).expect(200);

      await prisma.readerLibrary.update({
        where: { id: libraryId },
        data: { accessStatus: 'revoked', revokedAt: new Date() },
      });

      await readerAAgent.get(`/library/${libraryId}/download`).expect(403);

      // La commande, elle, reste payée : accès et historique sont indépendants.
      // Inclusion imbriquée sur `orderItem`/`order` (RLS) : contexte admin.
      const entry = await adminPrisma.readerLibrary.findUniqueOrThrow({
        where: { id: libraryId },
        include: { orderItem: { include: { order: true } } },
      });
      expect(entry.orderItem.order.status).toBe('paid');
    });

    it('refuse le téléchargement d’un accès expiré', async () => {
      const libraryId = await buyAndSettle(readerAAgent);

      await prisma.readerLibrary.update({
        where: { id: libraryId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await readerAAgent.get(`/library/${libraryId}/download`).expect(403);
    });

    it('refuse au-delà de la limite de téléchargements configurée', async () => {
      const libraryId = await buyAndSettle(readerAAgent);
      const previous = await prisma.setting.findUniqueOrThrow({
        where: { settingKey: 'download_limit' },
      });

      // Le quota est un réglage métier : un administrateur le change sans
      // redéploiement, le code doit le relire à chaque demande.
      await prisma.setting.update({
        where: { settingKey: 'download_limit' },
        data: { settingValue: '2' },
      });

      try {
        await readerAAgent.get(`/library/${libraryId}/download`).expect(200);
        await readerAAgent.get(`/library/${libraryId}/download`).expect(200);
        await readerAAgent.get(`/library/${libraryId}/download`).expect(403);

        const downloads = await prisma.download.count({ where: { libraryId } });
        expect(downloads).toBe(2);
      } finally {
        await prisma.setting.update({
          where: { settingKey: 'download_limit' },
          data: { settingValue: previous.settingValue },
        });
      }
    });

    it('signale un fichier corrompu plutôt que de le livrer', async () => {
      const libraryId = await buyAndSettle(readerAAgent);

      const file = await adminPrisma.workFile.findFirstOrThrow({
        where: { workFormatId: formatId, fileType: 'full' },
      });
      await adminPrisma.workFile.update({
        where: { id: file.id },
        data: { checksum: 'empreinte-qui-ne-correspond-plus' },
      });

      try {
        await readerAAgent.get(`/library/${libraryId}/download`).expect(500);
      } finally {
        await adminPrisma.workFile.update({
          where: { id: file.id },
          data: { checksum: file.checksum },
        });
      }
    });
  });

  /**
   * Ces quatre tests posent une limite connue : `@nestjs/serve-static` ne
   * s'attache pas de façon fiable à l'application de test (même constat que
   * `admin-catalog.e2e-spec`). Ils vérifient donc surtout qu'aucune *route*
   * n'expose les fichiers privés.
   *
   * La garantie de fond — le statique est bien monté et ne sert malgré tout
   * aucun fichier privé — a été vérifiée sur un serveur réellement démarré :
   * `/public/<couverture>` répond 200 tandis que tous les chemins vers
   * `storage/private`, y compris avec remontée de dossier encodée, répondent 404.
   */
  describe('Aucune URL directe ne sert un fichier (règle n° 19)', () => {
    it.each(['/public/works', '/storage/private/works', '/private/works'])(
      'ne sert rien sous %s',
      async (prefix) => {
        const file = await adminPrisma.workFile.findFirstOrThrow({
          where: { workFormatId: formatId, fileType: 'full' },
        });

        const response = await request(app.getHttpServer()).get(
          `${prefix}/${file.storedName}`,
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
      },
    );

    it('ne sert pas non plus le chemin de stockage enregistré en base', async () => {
      const file = await adminPrisma.workFile.findFirstOrThrow({
        where: { workFormatId: formatId, fileType: 'full' },
      });

      const response = await request(app.getHttpServer()).get(
        `/${file.storagePath}`,
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Extraits gratuits', () => {
    it('ne propose aucun extrait tant qu’aucun n’a été téléversé', async () => {
      await request(app.getHttpServer())
        .get(`/works/${workSlug}/formats/${formatId}/sample`)
        .expect(404);
    });

    it('sert l’extrait publiquement, sans compte ni achat', async () => {
      await adminAgent
        .post(`/admin/works/${workId}/formats/${formatId}/file`)
        .set('Origin', ORIGIN)
        .field('fileType', 'sample')
        .attach('file', SAMPLE_BYTES, {
          filename: 'extrait.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/works/${workSlug}/formats/${formatId}/sample`)
        .expect(200);

      expect(response.body).toEqual(SAMPLE_BYTES);
      expect(response.headers['content-disposition']).toContain('extrait');

      // L'extrait ne consomme aucun quota et n'entre pas dans la bibliothèque.
      const downloads = await prisma.download.count({
        where: { workFile: { workFormatId: formatId, fileType: 'sample' } },
      });
      expect(downloads).toBe(0);
    });

    it('refuse l’extrait d’une œuvre non publiée (règle n° 3)', async () => {
      await adminAgent
        .patch(`/admin/works/${workId}`)
        .set('Origin', ORIGIN)
        .send({ status: 'draft' })
        .expect(200);

      try {
        await request(app.getHttpServer())
          .get(`/works/${workSlug}/formats/${formatId}/sample`)
          .expect(404);
      } finally {
        await adminAgent
          .patch(`/admin/works/${workId}`)
          .set('Origin', ORIGIN)
          .send({ status: 'published' })
          .expect(200);
      }
    });
  });
});
