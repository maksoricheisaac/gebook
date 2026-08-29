import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthorStatus,
  ContentLocale,
  WorkStatus,
  WorkVisibility,
} from '../../generated/prisma/enums';
import {
  buildAuthorDetailSelection,
  buildAuthorSelection,
  toAuthorDetail,
  toAuthorSummary,
  type AuthorDetailResponse,
  type AuthorSummaryResponse,
} from './dto/catalog.response';

/** Un auteur n'apparaît publiquement que s'il est actif. */
const publiclyVisible = { status: AuthorStatus.active };

/**
 * Ne comptent que les œuvres réellement publiées et strictement `public` —
 * alignée sur `WorksService#publiclyVisible` (Phase 4). Utilisée hors
 * contexte tenant, où seule l'exposition publique a un sens.
 */
const publishedPublicWorks = {
  where: { status: WorkStatus.published, visibility: WorkVisibility.public },
};

/**
 * Depuis la vitrine du tenant lui-même (Phase 5) : compte aussi ses œuvres
 * `tenant_only`, alignée sur `WorksService#visibleWithinOwnTenant`.
 */
const publishedWorksWithinOwnTenant = {
  where: {
    status: WorkStatus.published,
    visibility: { not: WorkVisibility.private },
  },
};

@Injectable()
export class AuthorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    locale: ContentLocale,
    tenantSlug?: string,
  ): Promise<AuthorSummaryResponse[]> {
    const authors = await this.prisma.author.findMany({
      where: {
        ...publiclyVisible,
        ...(tenantSlug && { tenant: { slug: tenantSlug } }),
      },
      select: {
        ...buildAuthorSelection(locale),
        _count: {
          select: {
            works: tenantSlug
              ? publishedWorksWithinOwnTenant
              : publishedPublicWorks,
          },
        },
      },
      orderBy: { penName: 'asc' },
    });

    return authors.map(({ _count, ...author }) =>
      toAuthorSummary(author, locale, _count.works),
    );
  }

  async findBySlug(
    slug: string,
    locale: ContentLocale,
  ): Promise<AuthorDetailResponse> {
    const author = await this.prisma.author.findFirst({
      where: { slug, ...publiclyVisible },
      select: {
        ...buildAuthorDetailSelection(locale),
        // Œuvres `tenant_only` incluses : la fiche d'un auteur, comme celle
        // d'une œuvre (`WorksService#visibleWithinOwnTenant`), reste
        // consultable par lien direct au-delà du seul agrégat public.
        _count: { select: { works: publishedWorksWithinOwnTenant } },
      },
    });

    if (!author) {
      throw new NotFoundException(
        "Cet auteur n'existe pas ou n'est plus référencé.",
      );
    }

    const { _count, ...rest } = author;

    return toAuthorDetail(rest, locale, _count.works);
  }
}
