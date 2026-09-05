import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import {
  AuthorStatus,
  ContentLocale,
  WorkStatus,
  WorkVisibility,
} from '../../generated/prisma/enums';
import type { ListWorksQuery } from './dto/list-works.query';
import {
  buildWorkDetailSelection,
  buildWorkSelection,
  toWorkDetail,
  toWorkSummary,
  translationLocales,
  type PaginatedResponse,
  type WorkDetailResponse,
  type WorkSummaryResponse,
} from './dto/catalog.response';

/**
 * Filtre de visibilité publique, appliqué sans exception à toutes les lectures du
 * catalogue agrégé (multi-tenant, brief §14). Une œuvre n'apparaît ici que si :
 *
 *   - elle est publiée (`status`) ;
 *   - son auteur est actif (`author.status`) ;
 *   - elle est explicitement `public` (`visibility`) — une œuvre `tenant_only`
 *     reste réservée à la vitrine propre à son tenant (Phase 5), jamais
 *     agrégée ici ; une œuvre `private` n'est jamais publique du tout.
 *
 * C'est la règle métier n° 3, étendue par la Phase 4 (workflow éditorial).
 * Elle est isolée ici pour qu'aucune requête ne puisse l'oublier en la
 * réécrivant à sa façon.
 */
export const publiclyVisible = {
  status: WorkStatus.published,
  visibility: WorkVisibility.public,
  author: { status: AuthorStatus.active },
  deletedAt: null,
} satisfies Prisma.WorkWhereInput;

/**
 * Visibilité d'une œuvre depuis SA PROPRE fiche ou la vitrine de SON tenant
 * (Phase 5) : `tenant_only` s'y montre, contrairement au catalogue agrégé
 * (`publiclyVisible` ci-dessus, qui n'accepte que `public`). Seule `private`
 * reste exclue dans les deux cas — la nuance entre les deux constantes,
 * c'est très exactement ce que `tenant_only` est censé vouloir dire : visible
 * en regardant CET espace, jamais dans l'agrégat multi-tenant.
 */
const visibleWithinOwnTenant = {
  status: WorkStatus.published,
  visibility: { not: WorkVisibility.private },
  author: { status: AuthorStatus.active },
  deletedAt: null,
} satisfies Prisma.WorkWhereInput;

@Injectable()
export class WorksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListWorksQuery,
  ): Promise<PaginatedResponse<WorkSummaryResponse>> {
    const where = this.buildFilters(query);
    const skip = (query.page - 1) * query.perPage;

    const [total, works] = await Promise.all([
      this.prisma.work.count({ where }),
      this.prisma.work.findMany({
        where,
        select: buildWorkSelection(query.locale),
        // Les œuvres mises en avant remontent, dans l'ordre de priorité fixé
        // par le SuperAdmin (`featuredRank`, `NULLS LAST` par défaut sur un
        // tri ASC — une œuvre mise en avant sans priorité explicite passe
        // donc après celles qui en ont une), puis les plus récentes. `id`
        // départage pour garantir un ordre stable d'une page à l'autre.
        orderBy: [
          { featured: 'desc' },
          { featuredRank: 'asc' },
          { publishedAt: 'desc' },
          { id: 'asc' },
        ],
        skip,
        take: query.perPage,
      }),
    ]);

    return {
      data: works.map((work) => toWorkSummary(work, query.locale)),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async findBySlug(
    slug: string,
    locale: ContentLocale,
  ): Promise<WorkDetailResponse> {
    const work = await this.prisma.work.findFirst({
      // `findFirst` et non `findUnique` : le slug est unique, mais la condition de
      // visibilité doit s'appliquer. Une œuvre en brouillon ne doit pas devenir
      // accessible simplement parce que son adresse est connue.
      //
      // `visibleWithinOwnTenant`, pas `publiclyVisible` : une œuvre
      // `tenant_only` reste consultable par lien direct (sa propre fiche, ou
      // la vitrine de son tenant) — seule `private` doit rester inatteignable
      // ici. `publiclyVisible` (strict `public`) reste réservée à l'agrégat
      // (`list()`/`buildFilters()` sans filtre `tenant`).
      where: { slug, ...visibleWithinOwnTenant },
      select: buildWorkDetailSelection(locale),
    });

    if (!work) {
      throw new NotFoundException(
        "Cette œuvre n'existe pas ou n'est plus disponible.",
      );
    }

    return toWorkDetail(work, locale);
  }

  private buildFilters(query: ListWorksQuery): Prisma.WorkWhereInput {
    // Un filtre par tenant, c'est la vitrine de CET espace (Phase 5) : elle
    // montre aussi ses œuvres `tenant_only`, pas seulement `public`. Sans
    // filtre tenant, c'est l'agrégat multi-tenant — strictement `public`.
    const filters: Prisma.WorkWhereInput = query.tenant
      ? { ...visibleWithinOwnTenant }
      : { ...publiclyVisible };

    if (query.q) {
      // Même périmètre de recherche que la version PHP : titre, auteur et catégorie —
      // désormais via les tables de traduction (Phase 1 "bilinguisme"), dans la même
      // locale que celle demandée (avec repli `fr`, comme l'affichage).
      const locales = translationLocales(query.locale);
      filters.OR = [
        {
          translations: {
            some: {
              locale: { in: locales },
              title: { contains: query.q, mode: 'insensitive' },
            },
          },
        },
        { author: { penName: { contains: query.q, mode: 'insensitive' } } },
        {
          category: {
            translations: {
              some: {
                locale: { in: locales },
                name: { contains: query.q, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    if (query.category) {
      filters.category = { slug: query.category };
    }

    if (query.author) {
      filters.author = { ...publiclyVisible.author, slug: query.author };
    }

    if (query.tenant) {
      filters.tenant = { slug: query.tenant };
    }

    if (query.format) {
      // Un format indisponible ne doit pas faire apparaître l'œuvre dans un filtre
      // par format : le lecteur ne pourrait pas l'acheter.
      filters.formats = {
        some: { formatType: query.format, isAvailable: true },
      };
    }

    if (query.featured !== undefined) {
      filters.featured = query.featured;
    }

    return filters;
  }
}
