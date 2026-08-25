import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { LibraryEntryResponse } from './dto/library.response';
import { ListLibraryQuery } from './dto/list-library.query';
import type { DownloadableFile } from './library.service';
import { LibraryService } from './library.service';

/**
 * Bibliothèque du lecteur.
 *
 * Le fichier d'un ouvrage n'est jamais servi par une route statique : il ne sort
 * que d'ici, après contrôle de propriété, de statut et de quota (règle n° 19).
 * `storage/private` n'est raccordé à aucun `ServeStaticModule`.
 */
@Controller('library')
@UseGuards(AuthGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  list(
    @Query() query: ListLibraryQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    data: LibraryEntryResponse[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }> {
    return this.library.listForUser(user.id, query);
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.library.download(id, user.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return sendAsAttachment(file, response);
  }
}

/**
 * `Content-Disposition: attachment` : le fichier est enregistré, jamais affiché
 * dans le navigateur — un PDF ouvert dans un onglet se partage d'un clic.
 */
export function sendAsAttachment(
  file: DownloadableFile,
  response: Response,
): StreamableFile {
  response.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `attachment; filename="${file.fileName}"`,
    'Content-Length': String(file.buffer.length),
    // Un fichier acheté ne doit rester ni dans un cache partagé ni sur disque.
    'Cache-Control': 'private, no-store',
  });

  return new StreamableFile(file.buffer);
}
