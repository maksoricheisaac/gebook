import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  Category,
  CategoryTranslation,
} from '../../../generated/prisma/client';
import { ContentLocale } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActivityLogService } from '../../../common/activity-log.service';
import type {
  AdminListQuery,
  AdminPaginatedResponse,
} from './dto/admin-list.query';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

type CategoryWithTranslations = Category & {
  translations: CategoryTranslation[];
  _count: { works: number };
};

const categoryInclude = {
  translations: true,
  _count: { select: { works: true } },
};

export interface AdminCategoryStats {
  total: number;
  active: number;
  inactive: number;
  totalWorks: number;
  /** `null` quand `total` vaut 0 : pas de moyenne sur un ensemble vide. */
  avgWorksPerCategory: number | null;
}

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async list(
    query: AdminListQuery,
  ): Promise<AdminPaginatedResponse<CategoryWithTranslations>> {
    const where: Prisma.CategoryWhereInput = query.q
      ? {
          translations: {
            some: { name: { contains: query.q, mode: 'insensitive' } },
          },
        }
      : {};

    const [total, data] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        include: categoryInclude,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  /**
   * Chiffres de synthèse, calculés en base — jamais déduits de la page
   * courante d'une liste paginée. La moyenne se garde de diviser par zéro :
   * une plateforme sans catégorie n'a pas de moyenne, elle n'a rien.
   */
  async stats(): Promise<AdminCategoryStats> {
    const [total, active, totalWorks] = await Promise.all([
      this.prisma.category.count(),
      this.prisma.category.count({ where: { status: 'active' } }),
      this.prisma.work.count({
        where: { categoryId: { not: null }, deletedAt: null },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      totalWorks,
      avgWorksPerCategory: total === 0 ? null : totalWorks / total,
    };
  }

  async findOne(id: string): Promise<CategoryWithTranslations> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: categoryInclude,
    });
    if (!category) {
      throw new NotFoundException("Cette catégorie n'existe pas.");
    }
    return category;
  }

  async create(
    dto: CreateCategoryDto,
    adminId: string,
  ): Promise<CategoryWithTranslations> {
    const { translations, ...rest } = dto;

    const category = await this.prisma.category
      .create({
        data: {
          ...rest,
          // Colonnes historiques conservées pendant la transition (Phase 1
          // « bilinguisme ») : d'autres modules (aucun aujourd'hui pour
          // `Category`, mais le même principe que `Work.title`/`orders.service.ts`)
          // pourraient encore les lire directement tant que la migration de
          // nettoyage n'est pas passée.
          name: translations.fr.name,
          description: translations.fr.description,
          translations: {
            create: [
              { locale: ContentLocale.fr, ...translations.fr },
              ...(translations.en
                ? [{ locale: ContentLocale.en, ...translations.en }]
                : []),
            ],
          },
        },
        include: categoryInclude,
      })
      .catch((error: unknown) => {
        throw translateError(error);
      });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.category.create',
      entityType: 'category',
      entityId: category.id,
    });

    return category;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    adminId: string,
  ): Promise<CategoryWithTranslations> {
    await this.findOne(id);
    const { translations, ...rest } = dto;

    const category = await this.prisma.category
      .update({
        where: { id },
        data: {
          ...rest,
          ...(translations?.fr && {
            name: translations.fr.name,
            description: translations.fr.description,
          }),
        },
        include: categoryInclude,
      })
      .catch((error: unknown) => {
        throw translateError(error);
      });

    if (translations?.fr) {
      await this.prisma.categoryTranslation.upsert({
        where: {
          categoryId_locale: { categoryId: id, locale: ContentLocale.fr },
        },
        create: {
          categoryId: id,
          locale: ContentLocale.fr,
          ...translations.fr,
        },
        update: translations.fr,
      });
    }
    if (translations?.en) {
      await this.prisma.categoryTranslation.upsert({
        where: {
          categoryId_locale: { categoryId: id, locale: ContentLocale.en },
        },
        create: {
          categoryId: id,
          locale: ContentLocale.en,
          ...translations.en,
        },
        update: translations.en,
      });
    }

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.category.update',
      entityType: 'category',
      entityId: category.id,
    });

    return translations ? await this.findOne(id) : category;
  }

  async remove(id: string, adminId: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.category
      .delete({ where: { id } })
      .catch((error: unknown) => {
        throw translateError(error);
      });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.category.delete',
      entityType: 'category',
      entityId: id,
    });
  }
}

function translateError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictException('Ce slug de catégorie est déjà utilisé.');
    }
    if (error.code === 'P2025') {
      return new NotFoundException("Cette catégorie n'existe pas.");
    }
    if (error.code === 'P2003') {
      return new ConflictException(
        'Cette catégorie est encore référencée par des œuvres ou une sous-catégorie.',
      );
    }
  }
  return error as Error;
}
