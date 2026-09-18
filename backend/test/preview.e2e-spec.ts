import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { VirusScanService } from './../src/modules/files/virus-scan.service';
import { MailService } from './../src/modules/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { adminDb } from './support/admin-db';
import { fakeMailService } from './support/fake-mail';
import { fakeVirusScanner } from './support/fake-virus-scanner';
import { verifyAndLogin } from './support/verify-and-login';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@preview.e2e.test';

/** PDF réellement valide (contrairement au `%PDF-1.4\n%mock...` des autres
 * suites) : ce fichier est rendu pour de vrai par `PdfRasterizerService`, pas
 * seulement accepté par la validation de type — c'est la preuve que le
 * pipeline de génération marche de bout en bout, pas seulement que
 * `previewStatus` change de valeur. */
async function buildTestPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i}`, {
      x: 50,
      y: 200,
      size: 30,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return Buffer.from(await doc.save());
}

async function waitForPreviewStatus(
  prisma: PrismaService,
  formatId: string,
  timeoutMs = 20000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const format = await adminDb(prisma, (tx) =>
      tx.workFormat.findUniqueOrThrow({
        where: { id: formatId },
        select: { previewStatus: true },
      }),
    );
    if (format.previewStatus !== 'pending' && format.previewStatus !== 'none') {
      return format.previewStatus;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Génération de preview toujours « ${format.previewStatus} » après ${timeoutMs}ms.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Book Preview Sandbox : le backend est la seule source de vérité sur les
 * pages qu'un visiteur a le droit de voir (brief §5, §17). Ces tests
 * appellent directement `/preview/*`, jamais l'interface — exactement ce que
 * le brief §19 demande pour la partie sécurité.
 */
describe('Book Preview Sandbox (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = fakeMailService();

  let adminAgent: ReturnType<typeof request.agent>;
  let tenantAOwnerAgent: ReturnType<typeof request.agent>;
  let tenantBOwnerAgent: ReturnType<typeof request.agent>;
  let readerAgent: ReturnType<typeof request.agent>;
  let ownerReaderAgent: ReturnType<typeof request.agent>;

  let publicSlug: string;
  let publicFormatId: string;
  let privateSlug: string;
  let ownerReaderUserId: string;
  let ownerReaderWorkId: string;
  let ownerReaderFormatId: string;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Preview',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    await verifyAndLogin(agent, prisma, ORIGIN, email, mail.sent);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VirusScanService)
      .useValue(fakeVirusScanner())
      .overrideProvider(MailService)
      .useValue(mail)
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
    tenantAOwnerAgent = request.agent(app.getHttpServer());
    tenantBOwnerAgent = request.agent(app.getHttpServer());
    readerAgent = request.agent(app.getHttpServer());
    ownerReaderAgent = request.agent(app.getHttpServer());

    const adminEmail = `admin${EMAIL_DOMAIN}`;
    const tenantAEmail = `tenant-a${EMAIL_DOMAIN}`;
    const tenantBEmail = `tenant-b${EMAIL_DOMAIN}`;
    const readerEmail = `lecteur${EMAIL_DOMAIN}`;
    const ownerReaderEmail = `acheteur${EMAIL_DOMAIN}`;

    await register(adminAgent, adminEmail);
    await register(tenantAOwnerAgent, tenantAEmail);
    await register(tenantBOwnerAgent, tenantBEmail);
    await register(readerAgent, readerEmail);
    await register(ownerReaderAgent, ownerReaderEmail);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });

    const ownerReaderUser = await prisma.user.findUniqueOrThrow({
      where: { email: ownerReaderEmail },
    });
    ownerReaderUserId = ownerReaderUser.id;

    // Tenant A : porte l'œuvre publique et l'œuvre privée testées ci-dessous.
    await tenantAOwnerAgent
      .post('/tenants')
      .set('Origin', ORIGIN)
      .send({
        name: 'Preview Tenant A',
        slug: 'preview-tenant-a',
        type: 'independent_author',
        acceptTerms: true,
      })
      .expect(201);

    // Tenant B : sert uniquement à prouver qu'un membre d'un AUTRE tenant
    // n'obtient rien de plus qu'un lecteur ordinaire (brief §18).
    await tenantBOwnerAgent
      .post('/tenants')
      .set('Origin', ORIGIN)
      .send({
        name: 'Preview Tenant B',
        slug: 'preview-tenant-b',
        type: 'independent_author',
        acceptTerms: true,
      })
      .expect(201);

    const author = await tenantAOwnerAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName: 'Auteur Preview',
        slug: 'preview-auteur',
        userId: undefined,
      })
      .expect(201);
    const authorId = (author.body as { id: string }).id;

    // --- Œuvre publique, avec un vrai PDF de 8 pages -----------------------
    const publicWork = await tenantAOwnerAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        translations: { fr: { title: 'Œuvre Preview Publique' } },
        slug: 'preview-oeuvre-publique',
        status: 'published',
      })
      .expect(201);
    const publicWorkId = (publicWork.body as { id: string }).id;
    publicSlug = 'preview-oeuvre-publique';

    const publicFormat = await tenantAOwnerAgent
      .post(`/admin/works/${publicWorkId}/formats`)
      .set('Origin', ORIGIN)
      .send({
        formatType: 'pdf',
        price: '2000.00',
        deliveryType: 'digital_download',
      })
      .expect(201);
    publicFormatId = (publicFormat.body as { id: string }).id;

    const pdfBytes = await buildTestPdf(8);
    await tenantAOwnerAgent
      .post(`/admin/works/${publicWorkId}/formats/${publicFormatId}/file`)
      .set('Origin', ORIGIN)
      .attach('file', pdfBytes, {
        filename: 'livre.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    await waitForPreviewStatus(prisma, publicFormatId);

    // --- Œuvre privée (brouillon), pour vérifier l'accès équipe/admin only -
    const privateWork = await tenantAOwnerAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        translations: { fr: { title: 'Œuvre Preview Privée' } },
        slug: 'preview-oeuvre-privee',
      })
      .expect(201);
    privateSlug = 'preview-oeuvre-privee';
    void privateWork;

    // --- Œuvre distincte, possédée par `ownerReaderAgent` (achat simulé) ---
    const ownerReaderWork = await tenantAOwnerAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        translations: { fr: { title: 'Œuvre Preview Achetée' } },
        slug: 'preview-oeuvre-achetee',
        status: 'published',
      })
      .expect(201);
    ownerReaderWorkId = (ownerReaderWork.body as { id: string }).id;

    const ownerReaderFormat = await tenantAOwnerAgent
      .post(`/admin/works/${ownerReaderWorkId}/formats`)
      .set('Origin', ORIGIN)
      .send({
        formatType: 'pdf',
        price: '1500.00',
        deliveryType: 'digital_download',
      })
      .expect(201);
    ownerReaderFormatId = (ownerReaderFormat.body as { id: string }).id;

    await tenantAOwnerAgent
      .post(
        `/admin/works/${ownerReaderWorkId}/formats/${ownerReaderFormatId}/file`,
      )
      .set('Origin', ORIGIN)
      .attach('file', await buildTestPdf(2), {
        filename: 'livre.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await waitForPreviewStatus(prisma, ownerReaderFormatId);

    // Droit de bibliothèque posé directement (achat déjà couvert par les
    // tests de paiement) — seul l'effet sur la preview nous intéresse ici.
    // `ReaderLibrary` exige une ligne de commande existante (1:1) : une
    // commande minimale, déjà payée, sert uniquement de rattachement.
    await adminDb(prisma, async (tx) => {
      const work = await tx.work.findUniqueOrThrow({
        where: { id: ownerReaderWorkId },
        select: { tenantId: true, title: true },
      });
      const order = await tx.order.create({
        data: {
          orderNumber: `PREVIEW-TEST-${ownerReaderWorkId.slice(0, 8)}`,
          userId: ownerReaderUserId,
          status: 'paid',
          totalAmount: '1500.00',
        },
      });
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          tenantId: work.tenantId,
          workId: ownerReaderWorkId,
          workFormatId: ownerReaderFormatId,
          authorId,
          workTitle: work.title,
          authorName: 'Auteur Preview',
          formatType: 'pdf',
          unitPrice: '1500.00',
          lineTotal: '1500.00',
          orderNumber: order.orderNumber,
        },
      });
      await tx.readerLibrary.create({
        data: {
          userId: ownerReaderUserId,
          orderItemId: item.id,
          workId: ownerReaderWorkId,
          workFormatId: ownerReaderFormatId,
          accessStatus: 'active',
        },
      });
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Visiteur anonyme', () => {
    it('voit les pages publiques autorisées (3 par défaut)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/preview/${publicSlug}`)
        .expect(200);
      const body = res.body as {
        preview: {
          mode: string;
          status: string;
          maxPages: number;
          totalPages: number;
        };
        pages: { page: number; url: string }[];
      };
      expect(body.preview.mode).toBe('public');
      expect(body.preview.status).toBe('ready');
      expect(body.preview.maxPages).toBe(3);
      expect(body.preview.totalPages).toBe(8);
      expect(body.pages).toHaveLength(3);
      expect(body.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    });

    it('peut ouvrir les pages autorisées', async () => {
      const res = await request(app.getHttpServer())
        .get(`/preview/${publicSlug}/pages/1`)
        .expect(200);
      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['content-disposition']).toBe('inline');
    });

    it('ne peut pas dépasser la limite en appelant directement /pages/N (règle n° 17)', async () => {
      await request(app.getHttpServer())
        .get(`/preview/${publicSlug}/pages/4`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/preview/${publicSlug}/pages/8`)
        .expect(403);
    });

    it('ne peut pas voir une œuvre privée en devinant son adresse (règle n° 18)', async () => {
      await request(app.getHttpServer())
        .get(`/preview/${privateSlug}`)
        .expect(404);
    });

    it('renvoie 404 sur une adresse inconnue plutôt que de fuiter une information', async () => {
      await request(app.getHttpServer())
        .get('/preview/cette-oeuvre-nexiste-pas')
        .expect(404);
    });
  });

  describe('Lecteur connecté sans achat', () => {
    it('voit le nombre de pages configuré pour un lecteur (5 par défaut)', async () => {
      const res = await readerAgent.get(`/preview/${publicSlug}`).expect(200);
      const body = res.body as {
        preview: { mode: string; maxPages: number };
        pages: unknown[];
      };
      expect(body.preview.mode).toBe('reader');
      expect(body.preview.maxPages).toBe(5);
      expect(body.pages).toHaveLength(5);
    });

    it('ne peut pas dépasser sa propre limite', async () => {
      await readerAgent.get(`/preview/${publicSlug}/pages/6`).expect(403);
    });

    it('accède au livre complet dès lors qu’il possède les droits (achat)', async () => {
      const res = await ownerReaderAgent
        .get(`/preview/preview-oeuvre-achetee`)
        .expect(200);
      const body = res.body as {
        preview: { mode: string; maxPages: number | null; totalPages: number };
        pages: unknown[];
      };
      expect(body.preview.mode).toBe('owned');
      expect(body.preview.maxPages).toBeNull();
      expect(body.pages).toHaveLength(body.preview.totalPages);
    });

    it("un membre d'un AUTRE tenant n'obtient rien de plus qu'un lecteur ordinaire", async () => {
      const res = await tenantBOwnerAgent
        .get(`/preview/${publicSlug}`)
        .expect(200);
      const body = res.body as { preview: { mode: string; maxPages: number } };
      expect(body.preview.mode).toBe('reader');
      expect(body.preview.maxPages).toBe(5);
    });
  });

  describe('Auteur propriétaire', () => {
    it('peut prévisualiser sa propre œuvre sans limite de pages', async () => {
      const res = await tenantAOwnerAgent
        .get(`/preview/${publicSlug}`)
        .expect(200);
      const body = res.body as {
        preview: {
          mode: string;
          maxPages: number | null;
          canFullscreen: boolean;
          canDownload: boolean;
        };
        pages: unknown[];
      };
      expect(body.preview.mode).toBe('author');
      expect(body.preview.maxPages).toBeNull();
      expect(body.preview.canFullscreen).toBe(true);
      expect(body.preview.canDownload).toBe(false);
      expect(body.pages).toHaveLength(8);
    });

    it('peut parcourir toutes les pages générées, y compris au-delà des plafonds lecteur/visiteur', async () => {
      await tenantAOwnerAgent.get(`/preview/${publicSlug}/pages/8`).expect(200);
    });

    it('peut prévisualiser sa propre œuvre même non publiée', async () => {
      const res = await tenantAOwnerAgent
        .get(`/preview/${privateSlug}`)
        .expect(200);
      const body = res.body as { preview: { mode: string; status: string } };
      expect(body.preview.mode).toBe('author');
      // Aucun fichier envoyé pour cette œuvre : rien à afficher, mais l'accès
      // lui-même n'est pas refusé.
      expect(body.preview.status).toBe('none');
    });

    it("ne peut pas accéder à l'œuvre privée d'un autre tenant", async () => {
      await tenantBOwnerAgent.get(`/preview/${privateSlug}`).expect(404);
    });
  });

  describe('Administrateur', () => {
    it("peut prévisualiser n'importe quelle œuvre, y compris privée", async () => {
      const res = await adminAgent.get(`/preview/${privateSlug}`).expect(200);
      const body = res.body as { preview: { mode: string } };
      expect(body.preview.mode).toBe('admin');
    });

    it('a un accès complet à une œuvre publiée', async () => {
      const res = await adminAgent.get(`/preview/${publicSlug}`).expect(200);
      const body = res.body as {
        preview: { mode: string; maxPages: number | null };
      };
      expect(body.preview.mode).toBe('admin');
      expect(body.preview.maxPages).toBeNull();
    });
  });

  describe('Sécurité — manipulation directe', () => {
    it('refuse une page hors bornes (au-delà du nombre réel de pages)', async () => {
      await request(app.getHttpServer())
        .get(`/preview/${publicSlug}/pages/999`)
        .expect(404);
    });

    it('refuse une page nulle ou négative', async () => {
      await request(app.getHttpServer())
        .get(`/preview/${publicSlug}/pages/0`)
        .expect(404);
    });

    it('ne sert jamais le fichier original par ce chemin (aucune trace de storagePath)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/preview/${publicSlug}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(
        /storagePath|storage_path|\.pdf/i,
      );
    });
  });
});
