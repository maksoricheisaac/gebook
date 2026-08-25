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
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
