import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PreviewStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import { STORAGE_DRIVER, type StorageDriver } from '../files/storage-driver';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PreviewPolicyService } from './preview-policy.service';
import type { PreviewResponse } from './dto/preview.response';

export interface PreviewPageFile {
  buffer: Buffer;
  mimeType: string;
}

const STATUS_MAP: Record<PreviewStatus, PreviewResponse['preview']['status']> =
  {
    none: 'none',
    pending: 'pending',
    ready: 'ready',
    failed: 'failed',
  };

/**
 * Assemble la réponse de la Book Preview Sandbox à partir de la politique déjà
 * tranchée par `PreviewPolicyService` — ce service-ci ne fait plus de choix
 * d'autorisation, seulement de la mise en forme et la lecture des pages déjà
 * générées (brief §7).
 */
@Injectable()
export class PreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PreviewPolicyService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async getPreview(
    slug: string,
    user: AuthenticatedUser | null,
  ): Promise<PreviewResponse> {
    const { work, pdfFormat, policy } = await this.policy.resolveForSlug(
      slug,
      user,
    );

    const status = pdfFormat ? STATUS_MAP[pdfFormat.previewStatus] : 'none';
    const totalPages = pdfFormat?.previewPageCount ?? 0;

    const allowedPages =
      status === 'ready'
        ? policy.maxPages === null
          ? totalPages
          : Math.min(policy.maxPages, totalPages)
        : 0;

    const pages = Array.from({ length: allowedPages }, (_, index) => ({
      page: index + 1,
      url: `/preview/${work.slug}/pages/${index + 1}`,
    }));

    return {
      book: {
        id: work.id,
        title: work.title,
        author: work.author.penName,
        cover: work.coverPath,
        slug: work.slug,
      },
      preview: {
        mode: policy.mode,
        status,
        maxPages: policy.maxPages,
        totalPages,
        canNavigate: policy.canNavigate,
        canFullscreen: policy.canFullscreen,
        canDownload: policy.canDownload,
        watermark: policy.showWatermark,
        isFree: policy.isFree,
        requiresAuth: policy.requiresAuth,
      },
      pages,
    };
  }

  /**
   * Sert l'image d'UNE page. Revérifie la politique en entier (pas de cache
   * de la réponse `getPreview` réutilisé) : c'est cette relecture qui empêche
   * de contourner `maxPages` en appelant directement `/pages/10` (brief §17).
   */
  async getPage(
    slug: string,
    pageNumber: number,
    user: AuthenticatedUser | null,
  ): Promise<PreviewPageFile> {
    const { pdfFormat, policy } = await this.policy.resolveForSlug(slug, user);

    if (!pdfFormat || pdfFormat.previewStatus !== PreviewStatus.ready) {
      throw new NotFoundException("Cette page n'est pas disponible.");
    }

    const totalPages = pdfFormat.previewPageCount ?? 0;
    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new NotFoundException("Cette page n'existe pas.");
    }

    if (policy.maxPages !== null && pageNumber > policy.maxPages) {
      throw new ForbiddenException(
        "Cette page dépasse l'aperçu autorisé pour cette œuvre.",
      );
    }

    const row = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.workPreviewPage.findUnique({
        where: {
          workFormatId_pageNumber: {
            workFormatId: pdfFormat.id,
            pageNumber,
          },
        },
      }),
    );

    if (!row) {
      throw new NotFoundException("Cette page n'existe pas.");
    }

    const buffer = await this.storage.readPrivate(row.storagePath);
    return { buffer, mimeType: 'image/webp' };
  }
}
