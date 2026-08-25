import { createHash } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessStatus, FileType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { RlsContext } from '../../prisma/rls-context';
import { publiclyVisible } from '../catalog/works.service';
import { STORAGE_DRIVER, type StorageDriver } from '../files/storage-driver';
import type { LibraryEntryResponse } from './dto/library.response';
import type { ListLibraryQuery } from './dto/list-library.query';

/** Réglage `download_limit` : `0` signifie « téléchargements illimités ». */
const UNLIMITED_DOWNLOADS = 0;

export interface DownloadableFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface DownloadContext {
  ipAddress?: string;
  userAgent?: string;
}

const libraryInclude = {
  work: { select: { title: true, slug: true, coverPath: true } },
  workFormat: { select: { formatType: true, deliveryType: true } },
  orderItem: { select: { authorName: true } },
};

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async listForUser(
    userId: string,
    query: ListLibraryQuery,
  ): Promise<{
    data: LibraryEntryResponse[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }> {
    const where = { userId };
    // `libraryInclude` inclut `work`/`workFormat`/`orderItem`, tous protégés
    // par RLS (Phase 4) ; et `work_files` n'est visible pour un fichier "full"
    // que si le lecteur possède un droit d'accès actif dans `reader_library` —
    // d'où le contexte RLS du lecteur réel pour toute cette méthode, bien que
    // `reader_library`/`downloads` elles-mêmes n'aient pas de RLS.
    const ctx: RlsContext = { userId, tenantId: null, isPlatformAdmin: false };

    const [total, entries, downloadLimit] = await Promise.all([
      this.prisma.readerLibrary.count({ where }),
      this.prisma.withRlsContext(ctx, (tx) =>
        tx.readerLibrary.findMany({
          where,
          include: {
            ...libraryInclude,
            _count: { select: { downloads: true } },
          },
          orderBy: { grantedAt: 'desc' },
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ),
      this.downloadLimit(),
    ]);

    // Un format sans fichier actif reste dans la bibliothèque, mais annonce
    // franchement qu'il n'est pas téléchargeable : mieux vaut le dire que
    // proposer un bouton qui échouera.
    const withFile = new Set(
      (
        await this.prisma.withRlsContext(ctx, (tx) =>
          tx.workFile.findMany({
            where: {
              workFormatId: { in: entries.map((entry) => entry.workFormatId) },
              fileType: FileType.full,
              isActive: true,
            },
            select: { workFormatId: true },
          }),
        )
      ).map((file) => file.workFormatId),
    );

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        accessStatus: entry.accessStatus,
        grantedAt: entry.grantedAt.toISOString(),
        expiresAt: entry.expiresAt?.toISOString() ?? null,
        workTitle: entry.work.title,
        workSlug: entry.work.slug,
        authorName: entry.orderItem.authorName,
        coverPath: entry.work.coverPath,
        formatType: entry.workFormat.formatType,
        deliveryType: entry.workFormat.deliveryType,
        isDownloadable: withFile.has(entry.workFormatId),
        downloadCount: entry._count.downloads,
        downloadLimit,
      })),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  /**
   * Téléchargement d'un ouvrage acheté, dans l'ordre exact de l'audit §34.
   *
   * Le droit d'accès est lu dans `reader_library` et nulle part ailleurs : cette
   * requête ne joint jamais `orders` (règle n° 17). Un remboursement révoque
   * l'accès sans toucher à l'historique de commande, et le refus doit suivre
   * immédiatement.
   */
  async download(
    libraryId: string,
    userId: string,
    context: DownloadContext,
  ): Promise<DownloadableFile> {
    // `libraryInclude` inclut `work`/`workFormat`/`orderItem` (RLS, Phase 4) :
    // contexte du lecteur réel nécessaire pour que ces relations imbriquées
    // ne reviennent pas `null`.
    const entry = await this.prisma.withRlsContext(
      { userId, tenantId: null, isPlatformAdmin: false },
      (tx) =>
        tx.readerLibrary.findUnique({
          where: { id: libraryId },
          include: libraryInclude,
        }),
    );

    // Propriété : un lecteur n'apprend pas l'existence de la bibliothèque d'un
    // autre. 404 et non 403, comme pour les commandes.
    if (!entry || entry.userId !== userId) {
      throw new NotFoundException(
        "Cet ouvrage n'est pas dans votre bibliothèque.",
      );
    }

    // Ici la ressource est bien la sienne : le refus peut donc être explicite.
    if (entry.accessStatus !== AccessStatus.active) {
      throw new ForbiddenException(
        entry.accessStatus === AccessStatus.revoked
          ? 'Votre accès à cet ouvrage a été révoqué.'
          : 'Votre accès à cet ouvrage a expiré.',
      );
    }

    if (entry.expiresAt && entry.expiresAt <= new Date()) {
      throw new ForbiddenException('Votre accès à cet ouvrage a expiré.');
    }

    const file = await this.prisma.withRlsContext(
      { userId, tenantId: null, isPlatformAdmin: false },
      (tx) =>
        tx.workFile.findFirst({
          where: {
            workFormatId: entry.workFormatId,
            fileType: FileType.full,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
    );

    if (!file) {
      throw new NotFoundException(
        "Le fichier de cet ouvrage n'est pas encore disponible.",
      );
    }

    const limit = await this.downloadLimit();
    if (limit !== null) {
      const used = await this.prisma.download.count({
        where: { libraryId: entry.id },
      });
      if (used >= limit) {
        throw new ForbiddenException(
          `Vous avez atteint la limite de ${limit} téléchargements pour cet ouvrage.`,
        );
      }
    }

    const buffer = await this.readAndVerify(file.storagePath, file.checksum);

    // Journalisé avant diffusion : un téléchargement non tracé serait invisible
    // en cas de partage abusif (règle n° 20).
    await this.prisma.download.create({
      data: {
        libraryId: entry.id,
        userId,
        workFileId: file.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      buffer,
      fileName: this.downloadName(entry.work.title, file.storedName),
      mimeType: file.mimeType ?? 'application/octet-stream',
    };
  }

  /** Extrait gratuit : même chemin, sans contrôle de propriété (audit §34). */
  async sample(workSlug: string, formatId: string): Promise<DownloadableFile> {
    const format = await this.prisma.workFormat.findFirst({
      where: {
        id: formatId,
        // Un extrait ne s'obtient que sur une œuvre réellement publiée, avec le
        // même filtre de visibilité que le catalogue (règle n° 3).
        work: { slug: workSlug, ...publiclyVisible },
      },
      include: { work: { select: { title: true } } },
    });

    const file = format
      ? await this.prisma.workFile.findFirst({
          where: {
            workFormatId: format.id,
            fileType: FileType.sample,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (!format || !file) {
      throw new NotFoundException(
        "Aucun extrait n'est disponible pour ce format.",
      );
    }

    return {
      buffer: await this.readAndVerify(file.storagePath, file.checksum),
      fileName: this.downloadName(
        `${format.work.title} - extrait`,
        file.storedName,
      ),
      mimeType: file.mimeType ?? 'application/octet-stream',
    };
  }

  /**
   * Lit le fichier et compare son empreinte à celle enregistrée au téléversement.
   * La colonne `checksum` existait sans jamais servir : elle permet de détecter
   * une corruption du disque plutôt que de livrer un fichier illisible.
   */
  private async readAndVerify(
    storagePath: string,
    expectedChecksum: string | null,
  ): Promise<Buffer> {
    let buffer: Buffer;
    try {
      buffer = await this.storage.readPrivate(storagePath);
    } catch (error) {
      this.logger.error(
        `Fichier introuvable sur le stockage : ${storagePath}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new NotFoundException(
        "Le fichier de cet ouvrage n'est pas disponible pour le moment.",
      );
    }

    if (expectedChecksum) {
      const actual = createHash('sha256').update(buffer).digest('hex');
      if (actual !== expectedChecksum) {
        this.logger.error(
          `Empreinte incorrecte pour ${storagePath} : fichier probablement corrompu.`,
        );
        throw new InternalServerErrorException(
          'Le fichier de cet ouvrage est endommagé. Notre équipe a été prévenue.',
        );
      }
    }

    return buffer;
  }

  /** `null` lorsque les téléchargements sont illimités. */
  private async downloadLimit(): Promise<number | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { settingKey: 'download_limit' },
      select: { settingValue: true },
    });

    const limit = Number(setting?.settingValue);

    return Number.isInteger(limit) && limit > UNLIMITED_DOWNLOADS
      ? limit
      : null;
  }

  /**
   * Nom proposé au lecteur : le titre de l'œuvre, pas le nom aléatoire du
   * disque. Seule l'extension est reprise du fichier stocké.
   */
  private downloadName(title: string, storedName: string): string {
    const extension = storedName.split('.').pop() ?? 'bin';
    const safeTitle = title
      .toLowerCase()
      // Les ligatures françaises ne se décomposent pas en NFD : sans ces deux
      // remplacements, « Œuvres complètes » deviendrait « uvres-completes ».
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${safeTitle || 'ouvrage'}.${extension}`;
  }
}
