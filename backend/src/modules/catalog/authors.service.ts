import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthorStatus,
  ContentLocale,
  WorkStatus,
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

/** Ne comptent que les œuvres réellement publiées. */
const publishedWorks = { where: { status: WorkStatus.published } };

@Injectable()
export class AuthorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(locale: ContentLocale): Promise<AuthorSummaryResponse[]> {
    const authors = await this.prisma.author.findMany({
      where: publiclyVisible,
      select: {
        ...buildAuthorSelection(locale),
        _count: { select: { works: publishedWorks } },
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
        _count: { select: { works: publishedWorks } },
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
