import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  Author,
  AuthorTranslation,
} from '../../../generated/prisma/client';
import { ContentLocale } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildRlsContext } from '../../../prisma/rls-context';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { ActivityLogService } from '../../../common/activity-log.service';
import { LEGACY_SINGLE_TENANT_ID } from '../../tenants/legacy-tenant';
import { TENANT_CATALOG_WRITE_ROLES } from '../../tenants/tenant-context';
import type { TenantContext } from '../../tenants/tenant-context';
import { STORAGE_DRIVER, type StorageDriver } from '../../files/storage-driver';
import {
  EXTENSION_BY_MIME,
  UploadValidatorService,
} from '../../files/upload-validator.service';
import type {
  AdminListQuery,
  AdminPaginatedResponse,
} from './dto/admin-list.query';
import type { CreateAuthorDto, UpdateAuthorDto } from './dto/author.dto';

type AuthorWithTranslations = Author & {
  translations: AuthorTranslation[];
  _count: { works: number };
};

const authorInclude = {
  translations: true,
  _count: { select: { works: true } },
};

export interface AdminAuthorStats {
  total: number;
  active: number;
  noPhoto: number;
  totalWorks: number;
  /** `null` quand `total` vaut 0 : pas de moyenne sur un ensemble vide. */
  avgWorksPerAuthor: number | null;
}

/**
 * Vérifie qu'un rôle de tenant suffit pour créer/gérer le contenu du
 * catalogue (aligné sur les policies RLS `authors_insert`/`works_insert`,
 * brief §7). Un platform_admin n'a pas besoin de ce contrôle : RLS le laisse
 * de toute façon tout faire.
 */
function assertCanWriteCatalog(tenant: TenantContext): void {
  if (tenant.isPlatformAdmin) {
    return;
  }
  if (!tenant.role || !TENANT_CATALOG_WRITE_ROLES.includes(tenant.role)) {
    throw new ForbiddenException(
      'Votre rôle ne permet pas de créer ou modifier un auteur pour cet espace.',
    );
  }
}

@Injectable()
export class AdminAuthorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly uploadValidator: UploadValidatorService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async list(
    query: AdminListQuery,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AdminPaginatedResponse<AuthorWithTranslations>> {
    const where: Prisma.AuthorWhereInput = {
      ...(query.q && {
        penName: { contains: query.q, mode: 'insensitive' },
      }),
      // `tenant.tenantId` n'est `null` que pour un platform_admin sans espace
      // sélectionné (vue plateforme, tous tenants) — jamais pour un membre de
      // tenant, que `TenantAccessGuard` a déjà refusé dans ce cas.
      ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
    };

    const [total, data] = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        Promise.all([
          tx.author.count({ where }),
          tx.author.findMany({
            where,
            include: authorInclude,
            orderBy: { penName: 'asc' },
            skip: (query.page - 1) * query.perPage,
            take: query.perPage,
          }),
        ]),
    );

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
   * courante d'une liste paginée, qui ne reflète qu'un sous-ensemble.
   */
  async stats(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AdminAuthorStats> {
    const where: Prisma.AuthorWhereInput = {
      ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
    };

    const [total, active, noPhoto, totalWorks] =
      await this.prisma.withRlsContext(
        buildRlsContext(admin, tenant.tenantId),
        (tx) =>
          Promise.all([
            tx.author.count({ where }),
            tx.author.count({ where: { ...where, status: 'active' } }),
            tx.author.count({ where: { ...where, photoPath: null } }),
            tx.work.count({
              where: {
                ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
              },
            }),
          ]),
      );

    return {
      total,
      active,
      noPhoto,
      totalWorks,
      avgWorksPerAuthor: total === 0 ? null : totalWorks / total,
    };
  }

  async findOne(
    id: string,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AuthorWithTranslations> {
    // Filtre applicatif redondant avec la RLS (défense en profondeur, audit
    // Phase 0 §0.3, même correctif que `AdminWorksService.findOne`).
    const author = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        tx.author.findFirst({
          where: {
            id,
            ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
          },
          include: authorInclude,
        }),
    );
    if (!author) {
      throw new NotFoundException("Cet auteur n'existe pas.");
    }
    return author;
  }

  async create(
    dto: CreateAuthorDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AuthorWithTranslations> {
    assertCanWriteCatalog(tenant);

    // Un platform_admin sans espace sélectionné garde le comportement d'avant
    // le Tenant Dashboard (tenant historique unique) ; un membre de tenant a
    // toujours un `tenantId` résolu ici — `TenantAccessGuard` l'a garanti.
    const tenantId = tenant.tenantId ?? LEGACY_SINGLE_TENANT_ID;

    const { userId, birthDate, translations, ...rest } = dto;

    const author = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenantId), (tx) =>
        tx.author.create({
          data: {
            ...rest,
            tenantId,
            ...(birthDate !== undefined && { birthDate: new Date(birthDate) }),
            // Style "unchecked" (userId scalaire, pas `user: { connect }`) : mélanger
            // les deux styles dans un même `data` rend l'union de types de Prisma
            // ambiguë dès qu'un champ FK scalaire (`tenantId`) est aussi présent.
            ...(userId !== undefined && { userId }),
            // Colonnes historiques conservées pendant la transition (Phase 1
            // « bilinguisme »), voir le commentaire équivalent dans
            // `admin-works.service.ts`.
            ...(translations?.fr && {
              biography: translations.fr.biography,
              shortBiography: translations.fr.shortBiography,
            }),
            ...(translations && {
              translations: {
                create: [
                  ...(translations.fr
                    ? [{ locale: ContentLocale.fr, ...translations.fr }]
                    : []),
                  ...(translations.en
                    ? [{ locale: ContentLocale.en, ...translations.en }]
                    : []),
                ],
              },
            }),
          },
          include: authorInclude,
        }),
      )
      .catch((error: unknown) => {
        throw translateError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.author.create',
      entityType: 'author',
      entityId: author.id,
    });

    return author;
  }

  async update(
    id: string,
    dto: UpdateAuthorDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AuthorWithTranslations> {
    const { userId, birthDate, translations, ...rest } = dto;

    await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        // Filtre applicatif redondant avec la RLS (défense en profondeur,
        // audit Phase 0 §0.3).
        const existing = await tx.author.findFirst({
          where: {
            id,
            ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
          },
        });
        if (!existing) {
          throw new NotFoundException("Cet auteur n'existe pas.");
        }
        await tx.author.update({
          where: { id },
          data: {
            ...rest,
            ...(birthDate !== undefined && { birthDate: new Date(birthDate) }),
            ...(userId !== undefined && {
              user: userId ? { connect: { id: userId } } : { disconnect: true },
            }),
            ...(translations?.fr && {
              biography: translations.fr.biography,
              shortBiography: translations.fr.shortBiography,
            }),
          },
        });

        // Une locale à la fois, comme `AdminWorksService.update` : un PATCH
        // qui ne contient que `translations.en` ne touche jamais `fr`.
        if (translations?.fr) {
          await tx.authorTranslation.upsert({
            where: {
              authorId_locale: { authorId: id, locale: ContentLocale.fr },
            },
            create: {
              authorId: id,
              locale: ContentLocale.fr,
              ...translations.fr,
            },
            update: translations.fr,
          });
        }
        if (translations?.en) {
          await tx.authorTranslation.upsert({
            where: {
              authorId_locale: { authorId: id, locale: ContentLocale.en },
            },
            create: {
              authorId: id,
              locale: ContentLocale.en,
              ...translations.en,
            },
            update: translations.en,
          });
        }
      })
      .catch((error: unknown) => {
        throw translateError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.author.update',
      entityType: 'author',
      entityId: id,
    });

    return this.findOne(id, admin, tenant);
  }

  async remove(
    id: string,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<void> {
    await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        // Filtre applicatif redondant avec la RLS (défense en profondeur,
        // audit Phase 0 §0.3).
        const existing = await tx.author.findFirst({
          where: {
            id,
            ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
          },
        });
        if (!existing) {
          throw new NotFoundException("Cet auteur n'existe pas.");
        }
        await tx.author.delete({ where: { id } });
      })
      .catch((error: unknown) => {
        throw translateError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.author.delete',
      entityType: 'author',
      entityId: id,
    });
  }

  async updatePhoto(
    id: string,
    file: Express.Multer.File,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AuthorWithTranslations> {
    await this.findOne(id, admin, tenant);

    const mime = this.uploadValidator.validateImage(file);
    const stored = await this.storage.storePublic(
      file.buffer,
      'authors',
      EXTENSION_BY_MIME[mime],
    );

    const author = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        tx.author.update({
          where: { id },
          data: { photoPath: stored.storagePath },
          include: authorInclude,
        }),
    );

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.author.photo',
      entityType: 'author',
      entityId: id,
    });

    return author;
  }
}

function translateError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictException(
        "Ce slug d'auteur ou ce compte utilisateur est déjà associé à un autre auteur.",
      );
    }
    if (error.code === 'P2025') {
      return new NotFoundException("Cet auteur n'existe pas.");
    }
    if (error.code === 'P2003') {
      return new ConflictException('Cet auteur a encore des œuvres associées.');
    }
  }
  return error as Error;
}
