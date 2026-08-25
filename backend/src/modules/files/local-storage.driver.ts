import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { StorageDriver, StoredFile } from './storage-driver';

const STORAGE_ROOT = join(process.cwd(), 'storage');
const PUBLIC_ROOT = join(STORAGE_ROOT, 'public');
const PRIVATE_ROOT = join(STORAGE_ROOT, 'private');

/**
 * Stockage sur disque local (audit §34) : suffisant pour un catalogue de
 * quelques dizaines d'ouvrages, derrière `StorageDriver` pour que ce choix
 * reste réversible.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  async storePublic(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile> {
    return this.store(PUBLIC_ROOT, directory, buffer, extension);
  }

  async storePrivate(
    buffer: Buffer,
    directory: string,
    extension: string,
  ): Promise<StoredFile> {
    return this.store(PRIVATE_ROOT, directory, buffer, extension);
  }

  async readPrivate(storagePath: string): Promise<Buffer> {
    return readFile(join(PRIVATE_ROOT, storagePath));
  }

  private async store(
    root: string,
    directory: string,
    buffer: Buffer,
    extension: string,
  ): Promise<StoredFile> {
    // Nom aléatoire : un chemin deviné ne mène nulle part (audit §34).
    const storedName = `${randomUUID()}.${extension}`;
    const storagePath = `${directory}/${storedName}`;
    const absolutePath = join(root, directory, storedName);

    await mkdir(join(root, directory), { recursive: true });
    await writeFile(absolutePath, buffer);

    return {
      storagePath,
      storedName,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
    };
  }
}
