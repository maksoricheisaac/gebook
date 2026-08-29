import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type {
  Work,
  WorkFormat,
  WorkTranslation,
} from '../../../generated/prisma/client';
import {
  ContentLocale,
  FileType,
  WorkStatus,
  WorkVisibility,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildRlsContext } from '../../../prisma/rls-context';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { ActivityLogService } from '../../../common/activity-log.service';
import { TENANT_CATALOG_WRITE_ROLES } from '../../tenants/tenant-context';
import type { TenantContext } from '../../tenants/tenant-context';
import { STORAGE_DRIVER, type StorageDriver } from '../../files/storage-driver';
import {
  EXTENSION_BY_MIME,
  UploadValidatorService,
} from '../../files/upload-validator.service';
import type {
  AdminListWorksQuery,
  AdminPaginatedResponse,
} from './dto/admin-list.query';
import type {
  CreateWorkDto,
  CreateWorkFormatDto,
  UpdateWorkDto,
  UpdateWorkFormatDto,
} from './dto/work.dto';

type WorkWithFormats = Work & {
  formats: WorkFormat[];
  translations: WorkTranslation[];
};

/** Ce que l'admin voit d'un fichier téléversé : jamais son chemin de stockage. */
export interface WorkFileSummary {
  id: string;
  fileType: FileType;
  originalName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  isActive: boolean;
  createdAt: Date;
}

const workInclude = {
  formats: { orderBy: { formatType: 'asc' as const } },
  translations: true,
};

/**
 * `visibility` (Phase 3) n'est pas encore exposée dans `CreateWorkDto` /
 * `UpdateWorkDto` — aucune interface de tenant n'existe pour la piloter
 * (Phase 9, workflow de publication). En attendant, on préserve exactement le
 * comportement d'avant le multi-tenant, où `status = 'published'` suffisait à
 * rendre une œuvre publique : publier une œuvre la rend donc automatiquement
 * `visibility: 'public'`. Sans ceci, toute œuvre créée après la Phase 4
 * hériterait du défaut sûr `'private'` du schéma et disparaîtrait du
 * catalogue public malgré son statut publié (régression constatée en testant
 * cette phase — voir `works.service.ts#publiclyVisible`).
 */
function visibilityForStatus(
  status: WorkStatus | undefined,
): WorkVisibility | undefined {
  if (status === undefined) {
    return undefined;
  }
  return status === WorkStatus.published
    ? WorkVisibility.public
    : WorkVisibility.private;
}

/**
 * Vérifie qu'un membre de tenant peut écrire sur une œuvre d'un auteur donné
 * (aligné sur la policy RLS `works_insert`/`work_formats_insert`) : un rôle
 * d'édition (owner/admin/editor) suffit pour tout le tenant ; un rôle
 * `author` ne suffit que pour ses propres œuvres. Un platform_admin n'a pas
 * besoin de ce contrôle : RLS le laisse de toute façon tout faire.
 *
 * Retourne le *niveau* d'autorisation plutôt qu'un simple booléen : un
 * `author` qui écrit sa propre œuvre reste soumis à des règles
 * supplémentaires (voir `assertAllowedStatus`) qu'un rôle d'édition n'a pas —
 * publier directement reste réservé à qui a la responsabilité éditoriale du
 * tenant, pas à qui a seulement écrit le livre.
 */
type WritePermission = 'editorial' | 'author-self';

function assertCanWriteWork(
  tenant: TenantContext,
  work: { tenantId: string; authorUserId: string | null },
  callerId: string,
): WritePermission {
  if (tenant.isPlatformAdmin) {
    return 'editorial';
  }
  if (work.tenantId !== tenant.tenantId) {
    throw new ForbiddenException(
      "Cette œuvre n'appartient pas à votre espace actif.",
    );
  }
  if (tenant.role && TENANT_CATALOG_WRITE_ROLES.includes(tenant.role)) {
    return 'editorial';
  }
  if (tenant.role === 'author' && work.authorUserId === callerId) {
    return 'author-self';
  }
  throw new ForbiddenException(
    'Votre rôle ne permet pas de modifier cette œuvre.',
  );
}

/**
 * Statuts qu'un auteur peut donner lui-même à sa propre œuvre : préparer
 * (`draft`) et soumettre à la relecture (`submitted`). Publier, dépublier ou
 * archiver reste un geste éditorial, réservé aux rôles owner/admin/editor
 * (ou au platform_admin) — sans quoi un auteur seul pourrait publier sans
 * aucune relecture, ce que `WritePermission` visait justement à empêcher.
 */
const AUTHOR_SELF_STATUSES: WorkStatus[] = [
  WorkStatus.draft,
  WorkStatus.submitted,
];

function assertAllowedStatus(
  permission: WritePermission,
  status: WorkStatus | undefined,
): void {
  if (
    status !== undefined &&
    permission === 'author-self' &&
    !AUTHOR_SELF_STATUSES.includes(status)
  ) {
    throw new ForbiddenException(
      'En tant qu’auteur, vous pouvez enregistrer un brouillon ou le soumettre à la relecture — la publication revient à l’équipe éditoriale.',
    );
  }
}

export interface AdminWorkStats {
  total: number;
  published: number;
  submitted: number;
  draft: number;
}

@Injectable()
export class AdminWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly uploadValidator: UploadValidatorService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /**
   * Chiffres de synthèse, calculés en base — jamais déduits de la page
   * courante d'une liste paginée, qui ne reflète qu'un sous-ensemble.
   */
  async stats(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AdminWorkStats> {
    const where: Prisma.WorkWhereInput = {
      ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
    };

    const [total, published, submitted, draft] =
      await this.prisma.withRlsContext(
        buildRlsContext(admin, tenant.tenantId),
        (tx) =>
          Promise.all([
            tx.work.count({ where }),
            tx.work.count({ where: { ...where, status: 'published' } }),
            tx.work.count({ where: { ...where, status: 'submitted' } }),
            tx.work.count({ where: { ...where, status: 'draft' } }),
          ]),
      );

    return { total, published, submitted, draft };
  }

  async list(
    query: AdminListWorksQuery,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<AdminPaginatedResponse<WorkWithFormats>> {
    const where: Prisma.WorkWhereInput = {
      ...(query.q && {
        translations: {
          some: { title: { contains: query.q, mode: 'insensitive' } },
        },
      }),
      ...(query.authorId && { authorId: query.authorId }),
      ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
    };

    const [total, data] = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        Promise.all([
          tx.work.count({ where }),
          tx.work.findMany({
            where,
            include: workInclude,
            orderBy: { createdAt: 'desc' },
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

  async findOne(
    id: string,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<WorkWithFormats> {
    // Filtre applicatif redondant avec la RLS (défense en profondeur, audit
    // Phase 0 §0.3) : un `findUnique` par id seul reposait entièrement sur la
    // policy `works_select` pour l'isolation tenant, comme `list()`/`stats()`
    // le font déjà via `where.tenantId`.
    const work = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        tx.work.findFirst({
          where: {
            id,
            ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
          },
          include: workInclude,
        }),
    );
    if (!work) {
      throw new NotFoundException("Cette œuvre n'existe pas.");
    }
    return work;
  }

  async create(
    dto: CreateWorkDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<Work> {
    const { publicationDate, translations, ...rest } = dto;

    const work = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        // Une œuvre appartient toujours au même tenant que son auteur — jamais
        // dupliqué manuellement, dérivé ici pour ne pas pouvoir diverger.
        const author = await tx.author.findUnique({
          where: { id: rest.authorId },
          select: { tenantId: true, userId: true },
        });
        if (!author) {
          throw new NotFoundException("Cet auteur n'existe pas.");
        }

        const permission = assertCanWriteWork(
          tenant,
          { tenantId: author.tenantId, authorUserId: author.userId },
          admin.id,
        );
        assertAllowedStatus(permission, rest.status);

        const visibility = visibilityForStatus(rest.status);
        return tx.work.create({
          data: {
            ...rest,
            tenantId: author.tenantId,
            ...(visibility !== undefined && { visibility }),
            ...(publicationDate && {
              publicationDate: new Date(publicationDate),
            }),
            // Colonnes historiques conservées pendant la transition (Phase 1
            // « bilinguisme ») : `orders.service.ts#buildOrderItem` lit encore
            // `work.title` directement pour l'instantané `workTitle` d'une
            // commande — les retirer maintenant casserait la création de
            // commande, pas seulement l'affichage du catalogue.
            title: translations.fr.title,
            subtitle: translations.fr.subtitle,
            shortDescription: translations.fr.shortDescription,
            description: translations.fr.description,
            tableOfContents: translations.fr.tableOfContents,
            translations: {
              create: [
                { locale: ContentLocale.fr, ...translations.fr },
                ...(translations.en
                  ? [{ locale: ContentLocale.en, ...translations.en }]
                  : []),
              ],
            },
          },
        });
      })
      .catch((error: unknown) => {
        throw translateWorkError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.create',
      entityType: 'work',
      entityId: work.id,
    });

    return work;
  }

  async update(
    id: string,
    dto: UpdateWorkDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<Work> {
    const { publicationDate, translations, ...rest } = dto;

    const work = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        const existing = await this.getWorkWithAuthorOrThrow(tx, id);
        const permission = assertCanWriteWork(
          tenant,
          { tenantId: existing.tenantId, authorUserId: existing.author.userId },
          admin.id,
        );
        assertAllowedStatus(permission, rest.status);

        const visibility = visibilityForStatus(rest.status);
        const updated = await tx.work.update({
          where: { id },
          data: {
            ...rest,
            ...(visibility !== undefined && { visibility }),
            ...(publicationDate && {
              publicationDate: new Date(publicationDate),
            }),
            // Voir le commentaire équivalent dans `create()` : colonnes
            // historiques tenues à jour tant que `orders.service.ts` les lit.
            ...(translations?.fr && {
              title: translations.fr.title,
              subtitle: translations.fr.subtitle,
              shortDescription: translations.fr.shortDescription,
              description: translations.fr.description,
              tableOfContents: translations.fr.tableOfContents,
            }),
          },
        });

        // Une locale à la fois : un PATCH qui ne contient que `translations.en`
        // ne doit jamais toucher la ligne `fr` (brief Phase 1 « bilinguisme »).
        if (translations?.fr) {
          await tx.workTranslation.upsert({
            where: { workId_locale: { workId: id, locale: ContentLocale.fr } },
            create: {
              workId: id,
              locale: ContentLocale.fr,
              ...translations.fr,
            },
            update: translations.fr,
          });
        }
        if (translations?.en) {
          await tx.workTranslation.upsert({
            where: { workId_locale: { workId: id, locale: ContentLocale.en } },
            create: {
              workId: id,
              locale: ContentLocale.en,
              ...translations.en,
            },
            update: translations.en,
          });
        }

        return updated;
      })
      .catch((error: unknown) => {
        throw translateWorkError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.update',
      entityType: 'work',
      entityId: work.id,
    });

    return work;
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
        const existing = await tx.work.findFirst({
          where: {
            id,
            ...(tenant.tenantId !== null && { tenantId: tenant.tenantId }),
          },
        });
        if (!existing) {
          throw new NotFoundException("Cette œuvre n'existe pas.");
        }
        await tx.work.delete({ where: { id } });
      })
      .catch((error: unknown) => {
        throw translateWorkError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.delete',
      entityType: 'work',
      entityId: id,
    });
  }

  async updateCover(
    id: string,
    file: Express.Multer.File,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<Work> {
    await this.findOne(id, admin, tenant);

    const mime = this.uploadValidator.validateImage(file);
    const stored = await this.storage.storePublic(
      file.buffer,
      'covers',
      EXTENSION_BY_MIME[mime],
    );

    const work = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        tx.work.update({
          where: { id },
          data: { coverPath: stored.storagePath },
        }),
    );

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.cover',
      entityType: 'work',
      entityId: id,
    });

    return work;
  }

  async createFormat(
    workId: string,
    dto: CreateWorkFormatDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<WorkFormat> {
    const format = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        const work = await this.getWorkWithAuthorOrThrow(tx, workId);
        assertCanWriteWork(
          tenant,
          { tenantId: work.tenantId, authorUserId: work.author.userId },
          admin.id,
        );
        return tx.workFormat.create({ data: { ...dto, workId } });
      })
      .catch((error: unknown) => {
        throw translateFormatError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.format.create',
      entityType: 'work_format',
      entityId: format.id,
    });

    return format;
  }

  async updateFormat(
    workId: string,
    formatId: string,
    dto: UpdateWorkFormatDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<WorkFormat> {
    const format = await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        await this.findFormatOrThrow(tx, workId, formatId);
        return tx.workFormat.update({ where: { id: formatId }, data: dto });
      })
      .catch((error: unknown) => {
        throw translateFormatError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.format.update',
      entityType: 'work_format',
      entityId: format.id,
    });

    return format;
  }

  async removeFormat(
    workId: string,
    formatId: string,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<void> {
    await this.prisma
      .withRlsContext(buildRlsContext(admin, tenant.tenantId), async (tx) => {
        await this.findFormatOrThrow(tx, workId, formatId);
        await tx.workFormat.delete({ where: { id: formatId } });
      })
      .catch((error: unknown) => {
        throw translateFormatError(error);
      });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.format.delete',
      entityType: 'work_format',
      entityId: formatId,
    });
  }

  async uploadFormatFile(
    workId: string,
    formatId: string,
    file: Express.Multer.File,
    fileType: FileType,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<WorkFileSummary> {
    const format = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      async (tx) => {
        const work = await this.getWorkWithAuthorOrThrow(tx, workId);
        assertCanWriteWork(
          tenant,
          { tenantId: work.tenantId, authorUserId: work.author.userId },
          admin.id,
        );
        return this.findFormatOrThrow(tx, workId, formatId);
      },
    );

    const mime = await this.uploadValidator.validateWorkFile(
      file,
      format.formatType,
    );
    // Stocké hors de toute racine servie publiquement : c'est la garantie de la
    // règle métier n° 19, pas une simple absence de lien vers le fichier.
    const stored = await this.storage.storePrivate(
      file.buffer,
      `works/${workId}`,
      EXTENSION_BY_MIME[mime],
    );

    const workFile = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenant.tenantId),
      (tx) =>
        tx.workFile.create({
          data: {
            workFormatId: formatId,
            fileType,
            originalName: file.originalname,
            storedName: stored.storedName,
            storagePath: stored.storagePath,
            mimeType: mime,
            fileSize: stored.size,
            checksum: stored.checksum,
          },
        }),
    );

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.work.format.file',
      entityType: 'work_file',
      entityId: workFile.id,
    });

    return {
      id: workFile.id,
      fileType: workFile.fileType,
      originalName: workFile.originalName,
      mimeType: workFile.mimeType,
      fileSize: workFile.fileSize,
      checksum: workFile.checksum,
      isActive: workFile.isActive,
      createdAt: workFile.createdAt,
    };
  }

  private async getWorkWithAuthorOrThrow(
    tx: Prisma.TransactionClient,
    workId: string,
  ): Promise<Work & { author: { userId: string | null } }> {
    const work = await tx.work.findUnique({
      where: { id: workId },
      include: { author: { select: { userId: true } } },
    });
    if (!work) {
      throw new NotFoundException("Cette œuvre n'existe pas.");
    }
    return work;
  }

  private async findFormatOrThrow(
    tx: Prisma.TransactionClient,
    workId: string,
    formatId: string,
  ): Promise<WorkFormat> {
    const format = await tx.workFormat.findUnique({
      where: { id: formatId },
    });
    if (!format || format.workId !== workId) {
      throw new NotFoundException("Ce format n'existe pas pour cette œuvre.");
    }
    return format;
  }
}

function translateWorkError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictException("Ce slug d'œuvre est déjà utilisé.");
    }
    if (error.code === 'P2025') {
      return new NotFoundException("Cette œuvre n'existe pas.");
    }
    if (error.code === 'P2003') {
      return new ConflictException(
        "L'auteur ou la catégorie indiqués n'existent pas, ou cette œuvre a encore des commandes associées.",
      );
    }
  }
  return error as Error;
}

function translateFormatError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Règle métier n° 2 : une œuvre ne peut avoir qu'un seul format de chaque type.
    if (error.code === 'P2002') {
      return new ConflictException(
        'Cette œuvre possède déjà un format de ce type.',
      );
    }
    if (error.code === 'P2025') {
      return new NotFoundException("Ce format n'existe pas.");
    }
    if (error.code === 'P2003') {
      return new ConflictException(
        'Ce format a encore des commandes associées.',
      );
    }
  }
  return error as Error;
}
