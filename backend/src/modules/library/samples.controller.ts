import {
  Controller,
  Get,
  HttpStatus,
  HttpException,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { sendAsAttachment } from './library.controller';
import { LibraryService } from './library.service';
import { SampleThrottleService } from './sample-throttle.service';

/**
 * Extraits gratuits.
 *
 * Publics et sans contrôle de propriété — c'est leur raison d'être — mais servis
 * par le même chemin contrôlé que les ouvrages achetés : aucun fichier ne sort
 * jamais d'une racine statique. La seule protection est une limitation par
 * adresse IP, contre l'aspiration du catalogue.
 */
@Controller('works')
export class SamplesController {
  constructor(
    private readonly library: LibraryService,
    private readonly throttle: SampleThrottleService,
  ) {}

  @Get(':slug/formats/:formatId/sample')
  async sample(
    @Param('slug') slug: string,
    @Param('formatId', ParseUUIDPipe) formatId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!this.throttle.accept(request.ip ?? 'inconnue')) {
      throw new HttpException(
        'Trop de téléchargements d’extraits. Veuillez patienter quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return sendAsAttachment(
      await this.library.sample(slug, formatId),
      response,
    );
  }
}
