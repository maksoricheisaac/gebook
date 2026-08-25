import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthorStatus,
  CategoryStatus,
  ContentLocale,
  WorkStatus,
} from '../../generated/prisma/enums';
import {
  buildCategorySelection,
  toCategoryResponse,
  type CategoryResponse,
} from './dto/catalog.response';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catégories actives, avec le nombre d'œuvres publiques.
   *
   * Ce compte alimente les filtres du catalogue. Il applique la même condition de
   * visibilité que la liste des œuvres, sans quoi un filtre annoncerait des résultats
   * qui n'apparaîtraient jamais.
   */
  async list(locale: ContentLocale): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      where: { status: CategoryStatus.active },
      select: {
        ...buildCategorySelection(locale),
        _count: {
          select: {
            works: {
              where: {
                status: WorkStatus.published,
                author: { status: AuthorStatus.active },
              },
            },
          },
        },
      },
      // Trie sur le nom français de base (encore en place pendant la
      // transition, cf. schema.prisma) plutôt que sur le nom résolu par
      // langue : un ORDER BY réellement multilingue demanderait de trier sur
      // une relation à plusieurs lignes, que Prisma ne permet pas directement.
      // Approximation assumée, pas un oubli.
      orderBy: { name: 'asc' },
    });

    return categories.map(({ _count, ...category }) =>
      toCategoryResponse(category, locale, _count.works),
    );
  }
}
