import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  contentTypeForPath,
  STORAGE_DRIVER,
  type StorageDriver,
} from './storage-driver';

/**
 * Diffuse les fichiers publics (couvertures, photos d'auteur, logos de
 * tenant) — remplace `ServeStaticModule`, qui ne pouvait lire que le disque
 * local. En passant par `StorageDriver.readPublic()`, cette route fonctionne
 * à l'identique que le pilote actif soit `LocalStorageDriver` ou
 * `R2StorageDriver` : le frontend (relais `app/api/media/[...path]`) n'a
 * jamais besoin de savoir lequel est en service.
 *
 * Aucune autorisation ici, volontairement — ces fichiers sont publics par
 * définition (même commentaire que le relais frontend qui appelle cette
 * route). Les livres achetés, eux, ne passent jamais par ici : voir
 * `LibraryController`, seul chemin pour `storage/private`.
 */
@Controller('public')
export class PublicFilesController {
  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  @Get('*path')
  async serve(
    @Param('path') segments: string[],
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    // Défense élémentaire contre la remontée d'arborescence — même contrôle
    // que le relais frontend, ici en seconde ligne (défense en profondeur,
    // audit Phase 0 §0.3) : un segment `..` ne doit jamais pouvoir sortir de
    // la racine publique du pilote de stockage actif.
    if (
      segments.some((segment) => segment === '..' || segment.includes('\\'))
    ) {
      throw new BadRequestException('Chemin de fichier invalide.');
    }

    const storagePath = segments.join('/');

    let buffer: Buffer;
    try {
      buffer = await this.storage.readPublic(storagePath);
    } catch {
      // Ni le pilote local (ENOENT) ni R2 (NoSuchKey) ne doivent fuiter leur
      // détail d'erreur interne au client — un fichier absent reste un 404
      // générique, comme n'importe quelle ressource introuvable.
      throw new NotFoundException('Ce fichier est introuvable.');
    }

    response.set({
      'Content-Type': contentTypeForPath(storagePath),
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=3600',
    });

    return new StreamableFile(buffer);
  }
}
