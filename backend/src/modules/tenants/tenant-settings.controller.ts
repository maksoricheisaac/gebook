import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import type { TenantStatisticsResponse } from '../commissions/commissions.service';
import { DateRangeQuery } from '../commissions/dto/date-range.query';
import { CurrentTenant } from './decorators/current-tenant.decorator';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import type { TenantContext } from './tenant-context';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import type { TenantProfileResponse } from './dto/tenant-profile.response';
import { TenantSettingsService } from './tenant-settings.service';

const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Paramètres et image de marque de l'espace actif (brief §7). Même garde que les autres modules admin. */
@Controller('admin/tenant')
@UseGuards(AuthGuard, TenantAccessGuard)
export class TenantSettingsController {
  constructor(
    private readonly settings: TenantSettingsService,
    private readonly commissions: CommissionsService,
  ) {}

  /** Ventes de l'espace actif — brief §7 "Tenant Dashboard". */
  @Get('statistics')
  statistics(
    @Query() range: DateRangeQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantStatisticsResponse> {
    return this.commissions.tenantStatistics(admin, tenant, range);
  }

  /** Série pour le graphe du tableau de bord de l'espace (Phase 9), parité avec `/admin/statistics/timeseries`. */
  @Get('statistics/timeseries')
  timeseries(
    @Query() range: DateRangeQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.commissions.tenantRevenueTimeseries(admin, tenant, range);
  }

  @Get()
  get(
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    return this.settings.get(admin, tenant);
  }

  @Patch()
  update(
    @Body() dto: UpdateTenantProfileDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    return this.settings.update(dto, admin, tenant);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  updateLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    if (!file) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }
    return this.settings.updateLogo(file, admin, tenant);
  }

  @Post('cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  updateCover(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    if (!file) {
      throw new BadRequestException("Aucun fichier n'a été envoyé.");
    }
    return this.settings.updateCover(file, admin, tenant);
  }
}
