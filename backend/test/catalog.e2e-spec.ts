import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import type {
  AuthorDetailResponse,
  AuthorSummaryResponse,
  CategoryResponse,
  PaginatedResponse,
  WorkDetailResponse,
  WorkSummaryResponse,
} from './../src/modules/catalog/dto/catalog.response';

/**
 * Ces tests s'exécutent sur la base réellement migrée et alimentée par
 * `prisma/seed.ts`. C'est volontaire : les règles vérifiées ici — visibilité des
 * brouillons, non-exposition des chemins de stockage — dépendent du schéma et des
 * contraintes, pas seulement du code TypeScript. Les simuler ne prouverait rien.
 */
describe('Catalogue public (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
  });

  afterAll(async () => {
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
      expect(meta.total).toBe(data.length);

      const work = data[0];
      expect(work.author.penName).toBeTruthy();
      expect(work.formats.length).toBeGreaterThan(0);
      // Le prix reste une chaîne décimale : aucun arrondi flottant entre la base
      // et l'écran.
      expect(work.formats[0].price).toMatch(/^\d+\.\d{2}$/);
      expect(work.priceFrom).toBe(work.formats[0].price);
    });

    it('n’expose jamais le chemin de stockage des fichiers', async () => {
      const { data } = await listWorks();

      expect(JSON.stringify(data)).not.toMatch(/storagePath|storage_path/i);
    });

    it('rend une œuvre en brouillon invisible du catalogue', async () => {
      const { data } = await listWorks();

      expect(data.map((work) => work.slug)).not.toContain('memoire-des-rives');
    });

    it('recherche sur le titre', async () => {
      const { data } = await listWorks('?q=harmonie');

      expect(data).toHaveLength(1);
      expect(data[0].slug).toBe('harmonie-et-pratique-musicale');
    });

    it('recherche sur le nom de l’auteur', async () => {
      const { data } = await listWorks('?q=linda');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.author.slug === 'linda-m')).toBe(true);
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
      const { data } = await listWorks('?author=mampouya-mamsy');

      expect(data.length).toBeGreaterThan(0);
      expect(data.every((work) => work.author.slug === 'mampouya-mamsy')).toBe(
        true,
      );
    });

    it('filtre par format', async () => {
      const { data } = await listWorks('?format=audio');

      expect(data.length).toBeGreaterThan(0);
      expect(
        data.every((work) =>
          work.formats.some(
            (format) => format.formatType === 'audio' && format.isAvailable,
          ),
        ),
      ).toBe(true);
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
        .get('/works/cours-de-musique-congolaise')
        .expect(200);

      const work = response.body as WorkDetailResponse;

      expect(work.title).toBe('Cours de musique congolaise');
      expect(work.description).toBeTruthy();
      expect(work.formats).toHaveLength(3);
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
        .get('/works/memoire-des-rives')
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
        .get('/authors/mampouya-mamsy')
        .expect(200);

      const author = response.body as AuthorDetailResponse;
      const { meta } = await listWorks('?author=mampouya-mamsy&perPage=48');

      expect(author.workCount).toBe(meta.total);
    });

    it('renvoie la biographie complète sur la fiche auteur', async () => {
      const response = await request(app.getHttpServer())
        .get('/authors/linda-m')
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
