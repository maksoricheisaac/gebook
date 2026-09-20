import { Inject, Injectable, Logger } from '@nestjs/common';
import { PreviewStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import { STORAGE_DRIVER, type StorageDriver } from '../files/storage-driver';
import { PreviewSettingsService } from '../settings/preview-settings.service';
import { PdfRasterizerService } from './pdf-rasterizer.service';

/**
 * Génère une fois pour toutes les pages prévisualisables d'un format
 * numérique, depuis son fichier `full` le plus récent (brief §6) — jamais à
 * la volée sur une requête de lecture. Déclenchée juste après l'upload
 * (`AdminWorksService.uploadFormatFile`), en tâche de fond : la réponse HTTP
 * de l'upload ne l'attend pas (aucune file de tâches durable dans ce projet —
 * limite connue et assumée pour cette V1 ; un échec ou un redémarrage pendant
 * la génération laisse le format en `pending`, ré-déclenchable en
 * re-téléversant le fichier).
 *
 * Traitement système déclenché par une action déjà autorisée en amont
 * (l'upload lui-même, vérifié par `AdminWorksService`) : `SYSTEM_CONTEXT`,
 * même principe que `PaymentsService.applyOutcome` pour un webhook — aucune
 * session utilisateur à ce stade, mais une autorité légitime pour les
 * écritures que cette tâche doit faire (`work_formats`, `work_preview_pages`
 * sont protégées par RLS comme le reste du catalogue).
 */
@Injectable()
export class PreviewGenerationService {
  private readonly logger = new Logger(PreviewGenerationService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rasterizer: PdfRasterizerService,
    private readonly previewSettings: PreviewSettingsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** Fire-and-forget : ne rejette jamais, toute erreur se termine en
   * `previewStatus: failed` plutôt que de remonter à l'appelant HTTP. */
  generateInBackground(workFormatId: string): void {
    // Une seule génération à la fois par format : plusieurs visiteurs qui
    // ouvrent l'aperçu au même moment ne déclenchent pas plusieurs rendus.
    if (this.running.has(workFormatId)) return;
    this.running.add(workFormatId);
    void this.generate(workFormatId)
      .catch((error: unknown) => {
        this.logger.error(
          `Génération de preview inattendue en échec pour le format ${workFormatId}.`,
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => this.running.delete(workFormatId));
  }

  private async generate(workFormatId: string): Promise<void> {
    const format = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.workFormat.findUnique({
        where: { id: workFormatId },
        include: {
          files: {
            where: { fileType: 'full', isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    );

    if (!format || format.formatType !== 'pdf') {
      // Le papier n'a rien à prévisualiser en pages — jamais une erreur, juste
      // rien à faire.
      return;
    }

    const file = format.files[0];
    if (!file) {
      return;
    }

    await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.workFormat.update({
        where: { id: workFormatId },
        data: { previewStatus: PreviewStatus.pending, previewError: null },
      }),
    );

    try {
      const buffer = await this.storage.readPrivate(file.storagePath);
      const settings = await this.previewSettings.get();

      const totalPages = await this.rasterizer.pageCount(buffer);
      const pagesToRender = Math.min(totalPages, settings.maxRenderPages);

      // Un format re-téléversé peut déjà avoir des pages d'une version
      // précédente du fichier — jamais mélangées avec les nouvelles.
      await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.workPreviewPage.deleteMany({ where: { workFormatId } }),
      );

      for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
        const rendered = await this.rasterizer.renderPage(buffer, pageNumber);
        const stored = await this.storage.storePrivate(
          rendered.buffer,
          `works/${format.workId}/formats/${workFormatId}/preview`,
          'webp',
        );

        await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
          tx.workPreviewPage.create({
            data: {
              workFormatId,
              pageNumber,
              storagePath: stored.storagePath,
              width: rendered.width,
              height: rendered.height,
            },
          }),
        );
      }

      await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.workFormat.update({
          where: { id: workFormatId },
          data: {
            previewStatus: PreviewStatus.ready,
            previewPageCount: pagesToRender,
            previewGeneratedAt: new Date(),
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Génération de preview en échec pour le format ${workFormatId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.workFormat.update({
          where: { id: workFormatId },
          data: {
            previewStatus: PreviewStatus.failed,
            previewError:
              error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }
}
