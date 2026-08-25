import type {
  AccessStatus,
  DeliveryType,
  FormatType,
} from '../../../generated/prisma/enums';

/**
 * Vue d'une entrée de bibliothèque.
 *
 * `storagePath` et `storedName` n'y figurent pas et n'y figureront jamais :
 * connaître l'emplacement d'un fichier privé ne sert à rien au navigateur, qui
 * passe forcément par la route de téléchargement contrôlée (règle n° 19).
 */
export interface LibraryEntryResponse {
  id: string;
  accessStatus: AccessStatus;
  grantedAt: string;
  expiresAt: string | null;
  workTitle: string;
  workSlug: string;
  authorName: string;
  coverPath: string | null;
  formatType: FormatType;
  deliveryType: DeliveryType;
  /** Faux tant qu'aucun fichier actif n'a été téléversé pour ce format. */
  isDownloadable: boolean;
  downloadCount: number;
  /** `null` lorsque les téléchargements sont illimités. */
  downloadLimit: number | null;
}
