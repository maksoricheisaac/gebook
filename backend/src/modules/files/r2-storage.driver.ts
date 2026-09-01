import { createHash, randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { contentTypeForPath } from './storage-driver';
import type { StorageDriver, StoredFile } from './storage-driver';

/**
 * Stockage sur Cloudflare R2, compatible S3 (audit §34 : « le jour où le
 * volume ou le multi-instance l'exige, S3StorageDriver remplace
 * LocalStorageDriver et rien d'autre ne change » — c'est exactement ce
 * remplacement).
 *
 * Un seul bucket, avec les mêmes préfixes `public/`/`private/` que
 * `LocalStorageDriver` utilise pour ses deux racines de disque — un seul
 * bucket à créer côté R2 plutôt que deux, et la distinction public/privé
 * reste entièrement portée par GeBook (quelle méthode est appelée), jamais
 * par un réglage d'accès public sur le bucket lui-même : le bucket R2 peut
 * (et doit) rester intégralement privé, `PublicFilesController` est le seul
 * chemin par lequel un fichier « public » ressort, exactement comme
 * aujourd'hui avec `ServeStaticModule`.
 *
 * Le SDK AWS officiel gère la signature SigV4 : une bonne raison de ne pas
 * la réimplémenter à la main comme `virus-scan.service.ts` le fait pour le
 * protocole `INSTREAM` de ClamAV — la surface est ici nettement plus large
 * et déjà bien couverte par un SDK largement audité.
 */
@Injectable()
export class R2StorageDriver implements StorageDriver {
  // Construits à la première utilisation, jamais dans le constructeur :
  // NestJS instancie tous les providers déclarés — y compris ce pilote
  // quand `STORAGE_DRIVER=local` (par défaut) et que R2 n'est pas configuré
  // du tout. Lire les identifiants ici ferait échouer le démarrage de
  // n'importe quelle installation qui n'utilise pas R2, ce qu'aucun de ces
  // réglages « optionnels sauf si actif » ne fait ailleurs dans ce fichier
  // de configuration.
  private client: S3Client | undefined;
  private bucket: string | undefined;

  constructor(private readonly config: ConfigService) {}

  private getClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      const accountId = this.config.getOrThrow<string>('R2_ACCOUNT_ID');
      this.bucket = this.config.getOrThrow<string>('R2_BUCKET');
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
          secretAccessKey: this.config.getOrThrow<string>(
            'R2_SECRET_ACCESS_KEY',
          ),
        },
      });
    }
    return { client: this.client, bucket: this.bucket };
  }

  async storePublic(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile> {
    return this.store('public', directory, buffer, extension);
  }

  async storePrivate(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile> {
    return this.store('private', directory, buffer, extension);
  }

  async readPrivate(storagePath: string): Promise<Buffer> {
    return this.read(`private/${storagePath}`);
  }

  async readPublic(storagePath: string): Promise<Buffer> {
    return this.read(`public/${storagePath}`);
  }

  private async store(
    root: 'public' | 'private',
    directory: string,
    buffer: Buffer,
    extension: string,
  ): Promise<StoredFile> {
    // Nom aléatoire : un chemin deviné ne mène nulle part — même garantie
    // que `LocalStorageDriver` (audit §34).
    const storedName = `${randomUUID()}.${extension}`;
    const storagePath = `${directory}/${storedName}`;
    const key = `${root}/${storagePath}`;
    const { client, bucket } = this.getClient();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypeForPath(storagePath),
      }),
    );

    return {
      storagePath,
      storedName,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
    };
  }

  private async read(key: string): Promise<Buffer> {
    const { client, bucket } = this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Objet R2 introuvable ou vide : ${key}`);
    }
    return Buffer.from(bytes);
  }
}
