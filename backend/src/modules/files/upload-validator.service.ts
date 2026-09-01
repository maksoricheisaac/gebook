import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FormatType } from '../../generated/prisma/enums';
import { sniffMimeType, type SniffedMimeType } from './mime-sniffer';
import { findDangerousPdfContent } from './pdf-active-content';
import {
  VirusScanService,
  VirusScanUnavailableError,
} from './virus-scan.service';

const IMAGE_MIME_TYPES: SniffedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_WORK_FILE_MB = 100;

/**
 * Formats sans livraison numérique n'ont aucun fichier à leur associer ;
 * `epub` en est volontairement absent — « PDF d'abord » (décision produit,
 * 2026-09, voir `accepted-format-types.ts`) — même si la valeur reste dans
 * le schéma Prisma pour d'éventuelles lignes déjà en base.
 */
const WORK_FILE_MIME_BY_FORMAT: Partial<Record<FormatType, SniffedMimeType[]>> =
  {
    [FormatType.pdf]: ['application/pdf'],
    [FormatType.audio]: ['audio/mpeg', 'audio/mp4'],
  };

export const EXTENSION_BY_MIME: Record<SniffedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

/**
 * Validation des téléversements : type MIME réel, taille (audit §34). Séparée du
 * stockage — cette classe décide si un fichier est acceptable, `StorageDriver`
 * décide seulement où l'écrire.
 */
@Injectable()
export class UploadValidatorService {
  private readonly logger = new Logger(UploadValidatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly virusScan: VirusScanService,
  ) {}

  async validateImage(file: Express.Multer.File): Promise<SniffedMimeType> {
    const mime = sniffMimeType(file.buffer);

    if (!mime || !IMAGE_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(
        "L'image doit être au format JPEG, PNG ou WebP.",
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException(
        `L'image ne doit pas dépasser ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} Mo.`,
      );
    }

    await this.runVirusScan(file.buffer);

    return mime;
  }

  async validateWorkFile(
    file: Express.Multer.File,
    formatType: FormatType,
  ): Promise<SniffedMimeType> {
    const allowed = WORK_FILE_MIME_BY_FORMAT[formatType];

    if (!allowed) {
      throw new BadRequestException(
        "Ce format de livraison n'accepte pas de fichier numérique.",
      );
    }

    const mime = sniffMimeType(file.buffer);

    if (!mime || !allowed.includes(mime)) {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas au format annoncé.',
      );
    }

    const maxBytes = await this.maxWorkFileSizeBytes();
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `Le fichier dépasse la taille maximale autorisée (${Math.floor(maxBytes / (1024 * 1024))} Mo).`,
      );
    }

    // Couche « structurelle » : détecte une catégorie de PDF dangereux (JS
    // embarqué, actions Launch, pièces jointes embarquées) même pour un
    // fichier que ClamAV n'a jamais vu — voir pdf-active-content.ts.
    if (mime === 'application/pdf') {
      const dangerousToken = findDangerousPdfContent(file.buffer);
      if (dangerousToken) {
        this.logger.warn(
          `PDF refusé : contenu actif détecté (${dangerousToken}).`,
        );
        throw new BadRequestException(
          'Ce PDF contient du contenu actif (JavaScript, action embarquée ou pièce jointe) non autorisé sur GeBook.',
        );
      }
    }

    await this.runVirusScan(file.buffer);

    return mime;
  }

  /**
   * Fail closed dans les deux sens (brief : « pas de faillite du SaaS à
   * cause d'un document téléversé ») : un fichier infecté est refusé, et
   * `clamd` indisponible refuse aussi le fichier plutôt que de laisser
   * passer un contenu jamais réellement scanné — jamais un scan
   * silencieusement ignoré.
   */
  private async runVirusScan(buffer: Buffer): Promise<void> {
    try {
      const result = await this.virusScan.scan(buffer);
      if (!result.clean) {
        throw new BadRequestException(
          'Ce fichier a été refusé par notre analyse de sécurité.',
        );
      }
    } catch (error) {
      if (error instanceof VirusScanUnavailableError) {
        this.logger.error(
          error.message,
          error.cause instanceof Error ? error.cause.stack : undefined,
        );
        throw new ServiceUnavailableException(
          "Le service d'analyse de sécurité n'est pas disponible pour le moment. Veuillez réessayer dans un instant.",
        );
      }
      throw error;
    }
  }

  /** Plafond configurable en base (`settings.max_pdf_size_mb`), sans redéploiement. */
  private async maxWorkFileSizeBytes(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({
      where: { settingKey: 'max_pdf_size_mb' },
    });

    const megabytes = setting ? Number(setting.settingValue) : NaN;
    const safeMegabytes = Number.isFinite(megabytes)
      ? megabytes
      : DEFAULT_MAX_WORK_FILE_MB;

    return safeMegabytes * 1024 * 1024;
  }
}
