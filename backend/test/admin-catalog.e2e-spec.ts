import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { VirusScanService } from './../src/modules/files/virus-scan.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminDb } from './support/admin-db';
import { fakeVirusScanner } from './support/fake-virus-scanner';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@phase6.e2e.test';

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n%mock pdf content for tests\n');
const TEXT_BYTES = Buffer.from('ceci n’est pas un fichier valide');

/**
 * Ces tests s'exécutent sur la base réellement migrée et alimentée par
 * `prisma/seed.ts`. Comme pour le catalogue public et l'authentification, les
 * règles vérifiées ici — unicité d'un format par œuvre, fichiers privés jamais
 * accessibles, journalisation — dépendent du schéma et du disque, pas seulement
 * du TypeScript.
 */
describe('Back-office du catalogue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Phase6',
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
    })
      .overrideProvider(VirusScanService)
      .useValue(fakeVirusScanner())
      .compile();

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
    readerAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    const readerEmail = `lecteur${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);
    await register(readerAgent, readerEmail);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });

    // Le rôle est attribué après la connexion : reconnexion pour une session à jour.
    await adminAgent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: adminEmail, password: 'MotDePasse1' })
      .expect(200);
  });

  afterAll(async () => {
    await adminDb(prisma, (tx) =>
      tx.work.deleteMany({ where: { slug: { startsWith: 'phase6-' } } }),
    );
    await prisma.category.deleteMany({
      where: { slug: { startsWith: 'phase6-' } },
    });
    await adminDb(prisma, (tx) =>
      tx.author.deleteMany({ where: { slug: { startsWith: 'phase6-' } } }),
    );
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  describe('Contrôle d’accès', () => {
    it('refuse un lecteur sur toutes les routes d’administration', async () => {
      await readerAgent.get('/admin/categories').expect(403);
      await readerAgent
        .post('/admin/categories')
        .set('Origin', ORIGIN)
        .send({ name: 'x', slug: 'x' })
        .expect(403);
    });

    it('refuse une requête non authentifiée', async () => {
      await request(app.getHttpServer()).get('/admin/categories').expect(401);
    });
  });

  describe('Catégories', () => {
    it('crée, liste, modifie et supprime une catégorie', async () => {
      const create = await adminAgent
        .post('/admin/categories')
        .set('Origin', ORIGIN)
        .send({
          translations: { fr: { name: 'Phase 6', description: 'Test' } },
          slug: 'phase6-categorie',
        })
        .expect(201);

      const categoryId = (create.body as { id: string }).id;

      const list = await adminAgent
        .get('/admin/categories?q=Phase 6')
        .expect(200);
      expect(
        (list.body as { data: { id: string }[] }).data.some(
          (c) => c.id === categoryId,
        ),
      ).toBe(true);

      await adminAgent
        .patch(`/admin/categories/${categoryId}`)
        .set('Origin', ORIGIN)
        .send({ translations: { fr: { name: 'Phase 6 modifiée' } } })
        .expect(200);

      await adminAgent
        .delete(`/admin/categories/${categoryId}`)
        .set('Origin', ORIGIN)
        .expect(204);

      await adminAgent.get(`/admin/categories/${categoryId}`).expect(404);
    });

    it('refuse un slug déjà utilisé', async () => {
      await adminAgent
        .post('/admin/categories')
        .set('Origin', ORIGIN)
        .send({
          translations: { fr: { name: 'Doublon' } },
          slug: 'phase6-doublon',
        })
        .expect(201);

      await adminAgent
        .post('/admin/categories')
        .set('Origin', ORIGIN)
        .send({
          translations: { fr: { name: 'Doublon 2' } },
          slug: 'phase6-doublon',
        })
        .expect(409);
    });
  });

  describe('Auteurs', () => {
    it('crée un auteur et lui associe une photo valide', async () => {
      const create = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({ penName: 'Auteur Phase 6', slug: 'phase6-auteur' })
        .expect(201);

      const authorId = (create.body as { id: string }).id;

      const photo = await adminAgent
        .post(`/admin/authors/${authorId}/photo`)
        .set('Origin', ORIGIN)
        .attach('file', JPEG_BYTES, {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      const photoPath = (photo.body as { photoPath: string }).photoPath;
      expect(photoPath).toMatch(/^authors\/.+\.jpg$/);

      // Le fichier existe réellement là où l'API affirme l'avoir écrit...
      await access(join(process.cwd(), 'storage', 'public', photoPath));

      // ...et `PublicFilesController` le ressert réellement, quel que soit le
      // pilote de stockage actif (local ici, R2 en production éventuellement) —
      // `PublicFilesController` étant un contrôleur Nest ordinaire (contrairement
      // à l'ancien `ServeStaticModule`, une middleware Express qui ne s'attachait
      // pas de façon fiable sous `Test.createTestingModule`), cette assertion
      // HTTP est désormais fiable ici.
      const served = await request(app.getHttpServer()).get(
        `/public/${photoPath}`,
      );
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.compare(served.body as Buffer, JPEG_BYTES)).toBe(0);
    });

    it('refuse un fichier dont le contenu ne correspond pas à une image', async () => {
      const create = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({ penName: 'Auteur Invalide', slug: 'phase6-auteur-invalide' })
        .expect(201);

      const authorId = (create.body as { id: string }).id;

      await adminAgent
        .post(`/admin/authors/${authorId}/photo`)
        .set('Origin', ORIGIN)
        .attach('file', TEXT_BYTES, {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
    });
  });

  describe('Œuvres et formats', () => {
    it('crée une œuvre, un format, et refuse un doublon de format (règle métier n° 2)', async () => {
      const author = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({ penName: 'Auteur Œuvre', slug: 'phase6-auteur-oeuvre' })
        .expect(201);
      const authorId = (author.body as { id: string }).id;

      const work = await adminAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send({
          authorId,
          translations: { fr: { title: 'Œuvre Phase 6' } },
          slug: 'phase6-oeuvre',
        })
        .expect(201);
      const workId = (work.body as { id: string }).id;

      await adminAgent
        .post(`/admin/works/${workId}/formats`)
        .set('Origin', ORIGIN)
        .send({
          formatType: 'pdf',
          price: '5000.00',
          deliveryType: 'digital_download',
        })
        .expect(201);

      const duplicate = await adminAgent
        .post(`/admin/works/${workId}/formats`)
        .set('Origin', ORIGIN)
        .send({
          formatType: 'pdf',
          price: '6000.00',
          deliveryType: 'digital_download',
        })
        .expect(409);

      expect((duplicate.body as { message: string }).message).toContain('déjà');
    });

    it('téléverse une couverture et un fichier numérique conformes au format', async () => {
      const author = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({ penName: 'Auteur Fichiers', slug: 'phase6-auteur-fichiers' })
        .expect(201);
      const authorId = (author.body as { id: string }).id;

      const work = await adminAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send({
          authorId,
          translations: { fr: { title: 'Œuvre Fichiers' } },
          slug: 'phase6-oeuvre-fichiers',
        })
        .expect(201);
      const workId = (work.body as { id: string }).id;

      const cover = await adminAgent
        .post(`/admin/works/${workId}/cover`)
        .set('Origin', ORIGIN)
        .attach('file', JPEG_BYTES, {
          filename: 'cover.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      expect((cover.body as { coverPath: string }).coverPath).toMatch(
        /^covers\/.+\.jpg$/,
      );

      const format = await adminAgent
        .post(`/admin/works/${workId}/formats`)
        .set('Origin', ORIGIN)
        .send({
          formatType: 'pdf',
          price: '4000.00',
          deliveryType: 'digital_download',
        })
        .expect(201);
      const formatId = (format.body as { id: string }).id;

      const upload = await adminAgent
        .post(`/admin/works/${workId}/formats/${formatId}/file`)
        .set('Origin', ORIGIN)
        .attach('file', PDF_BYTES, {
          filename: 'livre.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const body = upload.body as Record<string, unknown>;
      expect(body.mimeType).toBe('application/pdf');
      // Le chemin de stockage ne doit jamais apparaître dans une réponse (audit §71).
      expect(JSON.stringify(body)).not.toMatch(/storagePath|storage_path/i);

      const stored = await adminDb(prisma, (tx) =>
        tx.workFile.findUniqueOrThrow({ where: { id: body.id as string } }),
      );

      // Règle métier n° 19 : aucune URL directe ne doit servir ce fichier.
      await request(app.getHttpServer())
        .get(`/public/${stored.storagePath}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/${stored.storagePath}`)
        .expect(404);
    });

    it('refuse un fichier dont le contenu ne correspond pas au format annoncé', async () => {
      const author = await adminAgent
        .post('/admin/authors')
        .set('Origin', ORIGIN)
        .send({ penName: 'Auteur Mime', slug: 'phase6-auteur-mime' })
        .expect(201);
      const authorId = (author.body as { id: string }).id;

      const work = await adminAgent
        .post('/admin/works')
        .set('Origin', ORIGIN)
        .send({
          authorId,
          translations: { fr: { title: 'Œuvre Mime' } },
          slug: 'phase6-oeuvre-mime',
        })
        .expect(201);
      const workId = (work.body as { id: string }).id;

      const format = await adminAgent
        .post(`/admin/works/${workId}/formats`)
        .set('Origin', ORIGIN)
        .send({
          formatType: 'pdf',
          price: '4000.00',
          deliveryType: 'digital_download',
        })
        .expect(201);
      const formatId = (format.body as { id: string }).id;

      await adminAgent
        .post(`/admin/works/${workId}/formats/${formatId}/file`)
        .set('Origin', ORIGIN)
        .attach('file', TEXT_BYTES, {
          filename: 'livre.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });
  });

  describe('Journalisation', () => {
    it('journalise les actions d’administration', async () => {
      const create = await adminAgent
        .post('/admin/categories')
        .set('Origin', ORIGIN)
        .send({
          translations: { fr: { name: 'Phase 6 Journal' } },
          slug: 'phase6-journal',
        })
        .expect(201);

      const categoryId = (create.body as { id: string }).id;

      const logs = await adminDb(prisma, (tx) =>
        tx.activityLog.findMany({
          where: { action: 'admin.category.create', entityId: categoryId },
        }),
      );

      expect(logs).toHaveLength(1);
    });
  });
});
