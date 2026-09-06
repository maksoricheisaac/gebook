import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { MailService } from './../src/modules/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';
import type {
  AuthorDetailResponse,
  AuthorSummaryResponse,
  CategoryResponse,
  PaginatedResponse,
  WorkDetailResponse,
  WorkSummaryResponse,
} from './../src/modules/catalog/dto/catalog.response';
import { adminPrismaProxy } from './support/admin-db';
import { fakeMailService } from './support/fake-mail';
import { verifyAndLogin } from './support/verify-and-login';

const ORIGIN = 'http://localhost:3000';
const EMAIL_DOMAIN = '@catalog.e2e.test';
const SLUG_PREFIX = 'catalog-e2e';

/**
 * Ces tests s'exécutent sur la base réellement migrée, comme le reste de la
 * suite e2e — les règles vérifiées ici (visibilité des brouillons,
 * non-exposition des chemins de stockage) dépendent du schéma et des
 * contraintes, pas seulement du code TypeScript.
 *
 * Contrairement à une version antérieure de ce fichier, il ne s'appuie plus
 * sur un catalogue seedé (`prisma/seed.ts` ne crée plus aucun tenant ni
 * catalogue de démonstration — un tenant est une organisation réelle, créée
 * en libre-service, jamais une donnée à semer). Ce fichier construit donc son
 * propre tenant, ses propres auteurs et ses propres œuvres dans `beforeAll`,
 * et les retire dans `afterAll`, sur le même principe que les autres suites
 * (`orders.e2e-spec.ts`, `admin-catalog.e2e-spec.ts`).
 */
describe('Catalogue public (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminPrisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;

  let authorOneSlug: string;
  let authorLindaSlug: string;
  let workCoursSlug: string;
  let workHarmonieSlug: string;
  let workAutreSlug: string;
  let workBrouillonSlug: string;

  const register = async (
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> => {
    await agent
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'Test',
        lastName: 'Catalogue',
        email,
        password: 'MotDePasse1',
        passwordConfirmation: 'MotDePasse1',
        acceptTerms: true,
      })
      .expect(201);
    await verifyAndLogin(agent, adminPrisma, ORIGIN, email, mail.sent);
  };

  const createAuthor = async (
    slug: string,
    penName: string,
    biography?: string,
  ): Promise<string> => {
    const response = await adminAgent
      .post('/admin/authors')
      .set('Origin', ORIGIN)
      .send({
        penName,
        slug,
        status: 'active',
        ...(biography && {
          translations: { fr: { biography, shortBiography: biography } },
        }),
      })
      .expect(201);
    return (response.body as { id: string }).id;
  };

  const createPublishedWork = async (
    slug: string,
    title: string,
    authorId: string,
    categorySlug: string,
    formats: {
      formatType: string;
      price: string;
      deliveryType: string;
      stockQuantity?: number;
    }[],
  ): Promise<string> => {
    const category = await adminPrisma.category.findUniqueOrThrow({
      where: { slug: categorySlug },
      select: { id: true },
    });

    const response = await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId,
        categoryId: category.id,
        translations: {
          fr: { title, description: `${title} — description de test.` },
        },
        slug,
        status: 'published',
      })
      .expect(201);
    const workId = (response.body as { id: string }).id;

    for (const format of formats) {
      await adminAgent
        .post(`/admin/works/${workId}/formats`)
        .set('Origin', ORIGIN)
        .send(format)
        .expect(201);
    }

    return workId;
  };

  const mail = fakeMailService();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    adminPrisma = adminPrismaProxy(prisma);

    await adminPrisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await adminPrisma.tenant.deleteMany({
      where: { slug: `${SLUG_PREFIX}-tenant` },
    });

    adminAgent = request.agent(app.getHttpServer());
    const adminEmail = `admin${EMAIL_DOMAIN}`;
    await register(adminAgent, adminEmail);

    // Rôle plateforme, nécessaire pour `PATCH /admin/works/featured/:id`
    // (réservé au SuperAdmin) — voir plus bas, mise en avant de l'œuvre phare.
    const adminRole = await adminPrisma.role.findUniqueOrThrow({
      where: { name: 'admin' },
    });
    const adminUser = await adminPrisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    await adminPrisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });

    // Espace de test, créé en libre-service comme n'importe quel tenant réel
    // (brief §6) : le créateur en devient `owner`, ce qui suffit à écrire le
    // catalogue (`assertCanWriteCatalog`/`assertCanWriteWork`), sans avoir
    // besoin du rôle plateforme pour ça.
    await adminAgent
      .post('/tenants')
      .set('Origin', ORIGIN)
      .send({
        name: 'Catalogue E2E',
        slug: `${SLUG_PREFIX}-tenant`,
        type: 'independent_author',
        acceptTerms: true,
      })
      .expect(201);

    authorOneSlug = `${SLUG_PREFIX}-auteur-un`;
    authorLindaSlug = `${SLUG_PREFIX}-auteur-linda`;
    const authorOneId = await createAuthor(authorOneSlug, 'Auteur Un Test');
    const authorLindaId = await createAuthor(
      authorLindaSlug,
      'Linda M.',
      'Entrepreneure installée à Pointe-Noire, Linda M. écrit à partir de son propre parcours.',
    );

    workCoursSlug = `${SLUG_PREFIX}-cours-musique`;
    const workCoursId = await createPublishedWork(
      workCoursSlug,
      'Cours de musique congolaise',
      authorOneId,
      'musique',
      [
        {
          formatType: 'pdf',
          price: '5000.00',
          deliveryType: 'digital_download',
        },
        {
          formatType: 'paper',
          price: '15000.00',
          deliveryType: 'physical_delivery',
          stockQuantity: 25,
        },
      ],
    );
    // Œuvre phare : mise en avant réservée au rôle plateforme.
    await adminAgent
      .patch(`/admin/works/featured/${workCoursId}`)
      .set('Origin', ORIGIN)
      .send({ featured: true })
      .expect(200);

    workHarmonieSlug = `${SLUG_PREFIX}-harmonie`;
    await createPublishedWork(
      workHarmonieSlug,
      'Harmonie et pratique musicale',
      authorOneId,
      'musique',
      [
        {
          formatType: 'pdf',
          price: '5000.00',
          deliveryType: 'digital_download',
        },
      ],
    );

    workAutreSlug = `${SLUG_PREFIX}-entreprendre`;
    await createPublishedWork(
      workAutreSlug,
      'Entreprendre au Congo',
      authorLindaId,
      'sciences-humaines',
      [
        {
          formatType: 'pdf',
          price: '6000.00',
          deliveryType: 'digital_download',
        },
      ],
    );

    // Volontairement en brouillon (règle métier n° 3) : catégorie
    // `litterature`, pour que son décompte d'œuvres reste à zéro plus bas.
    workBrouillonSlug = `${SLUG_PREFIX}-brouillon`;
    const litterature = await adminPrisma.category.findUniqueOrThrow({
      where: { slug: 'litterature' },
      select: { id: true },
    });
    await adminAgent
      .post('/admin/works')
      .set('Origin', ORIGIN)
      .send({
        authorId: authorOneId,
        categoryId: litterature.id,
        translations: { fr: { title: 'Mémoire des rives (brouillon)' } },
        slug: workBrouillonSlug,
        status: 'draft',
      })
      .expect(201);
  });

  afterAll(async () => {
    await adminPrisma.work.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    await adminPrisma.author.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    await adminPrisma.tenantMember.deleteMany({
      where: { tenant: { slug: `${SLUG_PREFIX}-tenant` } },
    });
    await adminPrisma.tenant.deleteMany({
      where: { slug: `${SLUG_PREFIX}-tenant` },
    });
    await adminPrisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  const listWorks = async (
    query = '',
  ): Promise<PaginatedResponse<WorkSummaryResponse>> => {
    const response = await request(app.getHttpServer())
      .get(`/works${query}`)
      .expect(200);

    return response.body as PaginatedResponse<WorkSummaryResponse>;
  };

  describe('GET /works', () => {
    it('liste les œuvres publiées avec leurs formats et leur auteur', async () => {
      const { data, meta } = await listWorks();

      expect(data.length).toBeGreaterThan(0);
      expect(meta.total).toBe(data.length > 0 ? meta.total : 0);

      const work = data.find((w) => w.slug === workCoursSlug)!;
      expect(work.author.penName).toBeTruthy();
      expect(work.formats.length).toBeGreaterThan(0);
      // Le prix reste une chaîne décimale : aucun arrondi flottant entre la base
      // et l'écran.
      expect(work.formats[0].price).toMatch(/^\d+\.\d{2}$/);
      expect(work.priceFrom).toBe(
        [...work.formats].sort((a, b) => Number(a.price) - Number(b.price))[0]
          .price,
      );
    });

    it('n’expose jamais le chemin de stockage des fichiers', async () => {
      const { data } = await listWorks();

      expect(JSON.stringify(data)).not.toMatch(/storagePath|storage_path/i);
    });

    it('rend une œuvre en brouillon invisible du catalogue', async () => {
      const { data } = await listWorks();

      expect(data.map((work) => work.slug)).not.toContain(workBrouillonSlug);
    });

    it('recherche sur le titre', async () => {
      const { data } = await listWorks('?q=harmonie');

      expect(data).toHaveLength(1);
      expect(data[0].slug).toBe(workHarmonieSlug);
    });

    it('recherche sur le nom de l’auteur', async () => {
      const { data } = await listWorks('?q=linda');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.author.slug === authorLindaSlug)).toBe(
        true,
      );
    });

    it('ignore la casse dans la recherche', async () => {
      const minuscules = await listWorks('?q=musique');
      const majuscules = await listWorks('?q=MUSIQUE');

      expect(majuscules.meta.total).toBe(minuscules.meta.total);
      expect(majuscules.meta.total).toBeGreaterThan(0);
    });

    it('filtre par catégorie', async () => {
      const { data } = await listWorks('?category=musique');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.category?.slug === 'musique')).toBe(
        true,
      );
    });

    it('filtre par auteur', async () => {
      const { data } = await listWorks(`?author=${authorOneSlug}`);

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.author.slug === authorOneSlug)).toBe(
        true,
      );
    });

    it('filtre par format', async () => {
      const { data } = await listWorks('?format=paper');

      expect(data.length).toBeGreaterThan(0);
      expect(
        data.every((work) =>
          work.formats.some(
            (format) => format.formatType === 'paper' && format.isAvailable,
          ),
        ),
      ).toBe(true);
    });

    it('refuse un format non accepté', async () => {
      await request(app.getHttpServer()).get('/works?format=audio').expect(400);
    });

    it('filtre les œuvres mises en avant', async () => {
      const { data } = await listWorks('?featured=true');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.featured)).toBe(true);
    });

    it('pagine et ne répète aucune œuvre d’une page à l’autre', async () => {
      const premiere = await listWorks('?page=1&perPage=2');
      const seconde = await listWorks('?page=2&perPage=2');

      expect(premiere.data).toHaveLength(2);
      expect(premiere.meta.perPage).toBe(2);
      expect(premiere.meta.totalPages).toBe(Math.ceil(premiere.meta.total / 2));

      const slugs = new Set([
        ...premiere.data.map((work) => work.slug),
        ...seconde.data.map((work) => work.slug),
      ]);
      expect(slugs.size).toBe(premiere.data.length + seconde.data.length);
    });

    it('renvoie une liste vide, sans erreur, quand rien ne correspond', async () => {
      const { data, meta } = await listWorks('?q=zzzzintrouvable');

      expect(data).toEqual([]);
      expect(meta.total).toBe(0);
      expect(meta.totalPages).toBe(1);
    });

    it('refuse une taille de page démesurée', async () => {
      const response = await request(app.getHttpServer())
        .get('/works?perPage=10000')
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('perPage');
    });

    it('refuse un format inconnu', async () => {
      await request(app.getHttpServer())
        .get('/works?format=cassette')
        .expect(400);
    });

    it('refuse un paramètre non déclaré', async () => {
      await request(app.getHttpServer()).get('/works?limit=5').expect(400);
    });
  });

  describe('GET /works/:slug', () => {
    it('renvoie le détail d’une œuvre publiée', async () => {
      const response = await request(app.getHttpServer())
        .get(`/works/${workCoursSlug}`)
        .expect(200);

      const work = response.body as WorkDetailResponse;

      expect(work.title).toBe('Cours de musique congolaise');
      expect(work.description).toBeTruthy();
      expect(work.formats).toHaveLength(2);
      expect(JSON.stringify(work)).not.toMatch(/storagePath|storage_path/i);
    });

    it('répond 404 sur un slug inconnu', async () => {
      await request(app.getHttpServer())
        .get('/works/slug-inexistant')
        .expect(404);
    });

    it('répond 404 sur une œuvre en brouillon, même si son slug est connu', async () => {
      // Une adresse devinée ou partagée ne doit pas contourner la publication.
      await request(app.getHttpServer())
        .get(`/works/${workBrouillonSlug}`)
        .expect(404);
    });
  });

  describe('GET /authors', () => {
    it('liste les auteurs actifs avec leur nombre d’œuvres publiées', async () => {
      const response = await request(app.getHttpServer())
        .get('/authors')
        .expect(200);

      const authors = response.body as AuthorSummaryResponse[];

      expect(authors.length).toBeGreaterThan(0);
      expect(
        authors.every((author) => typeof author.workCount === 'number'),
      ).toBe(true);
    });

    it('ne compte pas les brouillons dans le nombre d’œuvres', async () => {
      const response = await request(app.getHttpServer())
        .get(`/authors/${authorOneSlug}`)
        .expect(200);

      const author = response.body as AuthorDetailResponse;
      const { meta } = await listWorks(`?author=${authorOneSlug}&perPage=48`);

      expect(author.workCount).toBe(meta.total);
    });

    it('renvoie la biographie complète sur la fiche auteur', async () => {
      const response = await request(app.getHttpServer())
        .get(`/authors/${authorLindaSlug}`)
        .expect(200);

      const author = response.body as AuthorDetailResponse;

      expect(author.penName).toBe('Linda M.');
      expect(author.biography).toBeTruthy();
    });

    it('répond 404 sur un auteur inconnu', async () => {
      await request(app.getHttpServer()).get('/authors/personne').expect(404);
    });
  });

  describe('GET /categories', () => {
    it('liste les catégories actives avec le nombre d’œuvres publiques', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      const categories = response.body as CategoryResponse[];

      expect(categories.length).toBeGreaterThan(0);

      const musique = categories.find(
        (category) => category.slug === 'musique',
      );
      expect(musique?.workCount).toBeGreaterThan(0);

      // La catégorie de l'œuvre en brouillon existe, mais ne compte aucune œuvre.
      const litterature = categories.find(
        (category) => category.slug === 'litterature',
      );
      expect(litterature?.workCount).toBe(0);
    });
  });
});
