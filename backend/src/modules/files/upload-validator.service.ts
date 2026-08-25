import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FormatType } from '../../generated/prisma/enums';
import { sniffMimeType, type SniffedMimeType } from './mime-sniffer';

const IMAGE_MIME_TYPES: SniffedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_WORK_FILE_MB = 100;

/** Formats sans livraison numérique : aucun fichier n'a de sens à leur associer. */
const WORK_FILE_MIME_BY_FORMAT: Partial<Record<FormatType, SniffedMimeType[]>> =
  {
    [FormatType.pdf]: ['application/pdf'],
    [FormatType.epub]: ['application/epub+zip'],
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
  constructor(private readonly prisma: PrismaService) {}

  validateImage(file: Express.Multer.File): SniffedMimeType {
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

    return mime;
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
