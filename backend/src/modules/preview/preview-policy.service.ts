import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import { AccessStatus, FormatType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PreviewSettingsService } from '../settings/preview-settings.service';
import { resolvePreviewPolicy, type PreviewPolicy } from './preview-policy';

const workForPreviewSelect = {
  id: true,
  title: true,
  slug: true,
  coverPath: true,
  status: true,
  visibility: true,
  deletedAt: true,
  tenantId: true,
  authorId: true,
  author: { select: { userId: true, penName: true } },
  formats: {
    select: {
      id: true,
      formatType: true,
      isAvailable: true,
      price: true,
      previewStatus: true,
      previewPageCount: true,
      previewError: true,
      updatedAt: true,
      // Sert uniquement à savoir qu'un fichier complet existe (génération à la
      // demande des livres uploadés avant la Book Preview Sandbox).
      files: {
        where: { fileType: 'full' as const, isActive: true },
        select: { id: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.WorkSelect;

type WorkForPreview = Prisma.WorkGetPayload<{
  select: typeof workForPreviewSelect;
}>;

export interface ResolvedPreview {
  work: WorkForPreview;
  pdfFormat: WorkForPreview['formats'][number] | null;
  policy: PreviewPolicy;
}

/**
 * Résolveur central de la Book Preview Sandbox : la SEULE fonction qui décide
 * qui a le droit de voir quoi (brief §5, §13). Le contrôleur ne fait ensuite
 * plus qu'appliquer cette décision — jamais recalculée ni contournable
 * ailleurs.
 */
@Injectable()
export class PreviewPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PreviewSettingsService,
  ) {}

  async resolveForSlug(
    slug: string,
    user: AuthenticatedUser | null,
  ): Promise<ResolvedPreview> {
    // Message générique, volontairement identique qu'une œuvre n'existe pas
    // ou qu'elle existe mais reste hors de portée de ce visiteur (brief §18 —
    // jamais confirmer l'existence d'une œuvre privée d'un autre tenant).
    const notFound = () =>
      new NotFoundException(
        "Cette œuvre n'existe pas ou n'est plus disponible.",
      );

    // Lu hors du contexte RLS habituel (`SYSTEM_CONTEXT`) : c'est précisément
    // le rôle de ce service de décider, en code applicatif, qui a le droit de
    // voir une œuvre non publique — la politique ci-dessous EST le contrôle
    // d'accès, RLS ne doit pas en refuser la lecture avant même qu'elle ait pu
    // s'appliquer.
    const { work, tenantRole, hasLibraryAccess } =
      await this.prisma.withRlsContext(SYSTEM_CONTEXT, async (tx) => {
        const work = await tx.work.findFirst({
          where: { slug, deletedAt: null },
          select: workForPreviewSelect,
        });
        if (!work) {
          return { work: null, tenantRole: null, hasLibraryAccess: false };
        }

        const [member, libraryEntry] = await Promise.all([
          user
            ? tx.tenantMember.findFirst({
                where: {
                  tenantId: work.tenantId,
                  userId: user.id,
                  status: 'active',
                },
                select: { role: true },
              })
            : null,
          user
            ? tx.readerLibrary.findFirst({
                where: {
                  userId: user.id,
                  workId: work.id,
                  accessStatus: AccessStatus.active,
                },
                select: { id: true },
              })
            : null,
        ]);

        return {
          work,
          tenantRole: member?.role ?? null,
          hasLibraryAccess: libraryEntry !== null,
        };
      });

    if (!work) {
      throw notFound();
    }

    const isPenNameAuthor = user !== null && work.author.userId === user.id;
    const settings = await this.settings.get();
    const isFree = this.resolveIsFree(work.formats);

    const policy = resolvePreviewPolicy({
      work,
      user,
      isPenNameAuthor,
      tenantRole,
      hasLibraryAccess,
      isFree,
      settings,
    });

    if (!policy) {
      throw notFound();
    }

    const pdfFormat =
      work.formats.find((format) => format.formatType === FormatType.pdf) ??
      null;

    return { work, pdfFormat, policy };
  }

  /** Gratuite si au moins un format est proposé à la vente, et qu'aucun
   * format disponible n'a de prix strictement positif. */
  private resolveIsFree(formats: WorkForPreview['formats']): boolean {
    const available = formats.filter((format) => format.isAvailable);
    if (available.length === 0) return false;
    return available.every((format) => format.price.isZero());
  }
}
