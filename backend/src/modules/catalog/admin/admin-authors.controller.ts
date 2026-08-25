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
import type { Author } from '../../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthGuard } from '../../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentTenant } from '../../tenants/decorators/current-tenant.decorator';
import { TenantAccessGuard } from '../../tenants/guards/tenant-access.guard';
import type { TenantContext } from '../../tenants/tenant-context';
import {
  AdminAuthorsService,
  type AdminAuthorStats,
} from './admin-authors.service';
import {
  AdminListQuery,
  type AdminPaginatedResponse,
} from './dto/admin-list.query';
import { CreateAuthorDto, UpdateAuthorDto } from './dto/author.dto';

const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Ouvert au superadmin ET aux membres de tenant (`TenantAccessGuard`, brief §7) :
 * un rôle d'édition insuffisant (viewer, marketing…) est refusé par RLS au
 * niveau de chaque requête, pas ici — voir le commentaire de `TenantAccessGuard`.
 */
@Controller('admin/authors')
@UseGuards(AuthGuard, TenantAccessGuard)
export class AdminAuthorsController {
  constructor(private readonly authors: AdminAuthorsService) {}

  @Get()
  list(
    @Query() query: AdminListQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AdminPaginatedResponse<Author>> {
    return this.authors.list(query, admin, tenant);
  }

  @Get('stats')
  stats(
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AdminAuthorStats> {
    return this.authors.stats(admin, tenant);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Author> {
    return this.authors.findOne(id, admin, tenant);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAuthorDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Author> {
    return this.authors.create(dto, admin, tenant);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAuthorDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Author> {
    return this.authors.update(id, dto, admin, tenant);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    return this.authors.remove(id, admin, tenant);
  }

  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES },
    }),
  )
  updatePhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Author> {
    if (!file) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }
    return this.authors.updatePhoto(id, file, admin, tenant);
  }
}
