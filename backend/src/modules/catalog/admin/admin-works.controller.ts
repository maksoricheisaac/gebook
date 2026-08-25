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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Work, WorkFormat } from '../../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthGuard } from '../../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentTenant } from '../../tenants/decorators/current-tenant.decorator';
import { TenantAccessGuard } from '../../tenants/guards/tenant-access.guard';
import type { TenantContext } from '../../tenants/tenant-context';
import {
  AdminWorksService,
  type AdminWorkStats,
  type WorkFileSummary,
} from './admin-works.service';
import {
  AdminListWorksQuery,
  type AdminPaginatedResponse,
} from './dto/admin-list.query';
import {
  CreateWorkDto,
  CreateWorkFormatDto,
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
}
