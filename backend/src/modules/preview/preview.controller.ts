import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PreviewResponse } from './dto/preview.response';
import { PreviewService } from './preview.service';

/**
 * Book Preview Sandbox — route publique (visiteur anonyme accepté), mais
 * consciente de qui la consulte quand une session existe (`OptionalAuthGuard`).
 * Le fichier original n'est jamais atteignable depuis ces routes — seules des
 * images de page, une par une, filtrées par `PreviewPolicyService`.
 */
@Controller('preview')
@UseGuards(OptionalAuthGuard)
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}

  @Get(':slug')
  getPreview(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<PreviewResponse> {
    return this.preview.getPreview(slug, user ?? null);
  }

  @Get(':slug/pages/:page')
  async getPage(
    @Param('slug') slug: string,
    @Param('page', ParseIntPipe) page: number,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.preview.getPage(slug, page, user ?? null);

    response.set({
      'Content-Type': file.mimeType,
      // Jamais `attachment` : une page de preview se regarde inline, elle ne
      // se télécharge pas (règle n° 5 du brief — pas de fichier livré).
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });

    return new StreamableFile(file.buffer);
  }
}
