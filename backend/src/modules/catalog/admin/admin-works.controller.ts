import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { Work, WorkFormat } from '../../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentTenant } from '../../tenants/decorators/current-tenant.decorator';
import { TenantAccessGuard } from '../../tenants/guards/tenant-access.guard';
import type { TenantContext } from '../../tenants/tenant-context';
import {
  AdminWorksService,
  type AdminWorkStats,
  type FeaturableWork,
  type FilePreview,
  type WorkFileSummary,
} from './admin-works.service';
import {
  AdminListQuery,
  AdminListWorksQuery,
  type AdminPaginatedResponse,
} from './dto/admin-list.query';
import {
  CreateWorkDto,
  CreateWorkFormatDto,
  SetFeaturedDto,
  UpdateWorkDto,
  UpdateWorkFormatDto,
  UploadWorkFileDto,
} from './dto/work.dto';

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Plafond de multer, en amont du contrôle réel effectué par `UploadValidatorService`. */
const MAX_WORK_FILE_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Voir le commentaire équivalent sur `AdminAuthorsController` (brief §7). */
@Controller('admin/works')
@UseGuards(AuthGuard, TenantAccessGuard)
export class AdminWorksController {
  constructor(private readonly works: AdminWorksService) {}

  @Get()
  list(
    @Query() query: AdminListWorksQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AdminPaginatedResponse<Work>> {
    return this.works.list(query, admin, tenant);
  }

  @Get('stats')
  stats(
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AdminWorkStats> {
    return this.works.stats(admin, tenant);
  }

  /**
   * Curation « à la une » — plateforme entière, SuperAdmin uniquement.
   * Déclarée avant `:id` pour que Nest ne capture pas "featured" comme un
   * identifiant (même raison que `stats` ci-dessus).
   */
  @Get('featured')
  @UseGuards(RolesGuard)
  @Roles('admin')
  listFeatured(
    @Query() query: AdminListQuery,
  ): Promise<AdminPaginatedResponse<FeaturableWork>> {
    return this.works.listFeaturable(query);
  }

  @Patch('featured/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setFeatured(
    @Param('id') id: string,
    @Body() dto: SetFeaturedDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<Work> {
    return this.works.setFeatured(id, dto, admin);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Work> {
    return this.works.findOne(id, admin, tenant);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateWorkDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Work> {
    return this.works.create(dto, admin, tenant);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Work> {
    return this.works.update(id, dto, admin, tenant);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    return this.works.remove(id, admin, tenant);
  }

  @Post(':id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  updateCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Work> {
    if (!file) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }
    return this.works.updateCover(id, file, admin, tenant);
  }

  @Post(':id/formats')
  @HttpCode(HttpStatus.CREATED)
  createFormat(
    @Param('id') workId: string,
    @Body() dto: CreateWorkFormatDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<WorkFormat> {
    return this.works.createFormat(workId, dto, admin, tenant);
  }

  @Patch(':id/formats/:formatId')
  updateFormat(
    @Param('id') workId: string,
    @Param('formatId') formatId: string,
    @Body() dto: UpdateWorkFormatDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<WorkFormat> {
    return this.works.updateFormat(workId, formatId, dto, admin, tenant);
  }

  @Delete(':id/formats/:formatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFormat(
    @Param('id') workId: string,
    @Param('formatId') formatId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    return this.works.removeFormat(workId, formatId, admin, tenant);
  }

  @Post(':id/formats/:formatId/file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_WORK_FILE_UPLOAD_BYTES },
    }),
  )
  uploadFormatFile(
    @Param('id') workId: string,
    @Param('formatId') formatId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadWorkFileDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<WorkFileSummary> {
    if (!file) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }
    return this.works.uploadFormatFile(
      workId,
      formatId,
      file,
      dto.fileType,
      admin,
      tenant,
    );
  }

  /**
   * Aperçu d'un fichier déjà téléversé, affiché dans l'onglet plutôt
   * qu'enregistré (`inline`, pas `attachment` — voir `sendInline` ci-dessous) :
   * c'est une vérification par l'équipe éditoriale, pas un téléchargement.
   */
  @Get(':id/formats/:formatId/files/:fileId/preview')
  async previewFile(
    @Param('id') workId: string,
    @Param('formatId') formatId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.works.previewFile(
      workId,
      formatId,
      fileId,
      admin,
      tenant,
    );
    return sendInline(file, response);
  }
}

/**
 * Même esprit que `sendAsAttachment` (`library.controller.ts`), disposition
 * opposée : `inline` pour qu'un PDF s'ouvre directement dans l'onglet plutôt
 * que de proposer un enregistrement — c'est un aperçu de vérification, pas
 * un fichier acheté à conserver.
 */
function sendInline(file: FilePreview, response: Response): StreamableFile {
  response.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `inline; filename="${file.fileName}"`,
    'Content-Length': String(file.buffer.length),
    'Cache-Control': 'private, no-store',
  });

  return new StreamableFile(file.buffer);
}
