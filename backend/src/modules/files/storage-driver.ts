export interface StoredFile {
  /** Chemin relatif à la racine de stockage — jamais un chemin absolu du disque. */
  storagePath: string;
  storedName: string;
  checksum: string;
  size: number;
}

/**
 * Abstraction du stockage de fichiers (audit §34), même principe que
 * `PaymentDriver` pour les paiements : le reste de l'application écrit et lit
 * des fichiers sans jamais savoir qu'ils vivent sur disque local. Le jour où le
 * volume ou le multi-instance l'exige, `S3StorageDriver` remplace
 * `LocalStorageDriver` et rien d'autre ne change.
 */
export interface StorageDriver {
  /** Fichiers servis directement (couvertures, photos d'auteur). */
  storePublic(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile>;

  /** Fichiers jamais accessibles par URL directe (livres numériques). */
  storePrivate(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile>;

  /** Lit un fichier privé pour le diffuser via un contrôleur authentifié (phase 9). */
  readPrivate(storagePath: string): Promise<Buffer>;

  /**
   * Lit un fichier public pour le diffuser via `PublicFilesController` — le
   * point de passage unique qui rend la diffusion des fichiers publics
   * indépendante du pilote actif (disque local ou R2), exactement comme
   * `readPrivate` l'est déjà pour les fichiers privés.
   */
  readPublic(storagePath: string): Promise<Buffer>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/**
 * Type MIME déduit de l'extension stockée — les fichiers publics n'ont pas
 * de MIME conservé à côté d'eux (contrairement à `WorkFile.mimeType` côté
 * privé) : ni `LocalStorageDriver` ni `R2StorageDriver` ne le retiennent,
 * volontairement, puisque `PublicFilesController` n'a besoin de le connaître
 * qu'au moment de servir le fichier, pas de le stocker en base pour ça.
 * Fermé sur les extensions réellement produites par `UploadValidatorService`
 * (`EXTENSION_BY_MIME`) et par le SVG des couvertures de démonstration
 * (`prisma/seed.ts`) — jamais un détecteur MIME général.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function contentTypeForPath(storagePath: string): string {
  const extension = storagePath.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
