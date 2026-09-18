import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PreviewSettingsService } from './preview-settings.service';
import {
  PreviewSettingsResponse,
  UpdatePreviewSettingsDto,
} from './dto/preview-settings.dto';

/** Réglages du Book Preview Sandbox — nombre de pages par mode, filigrane,
 * plafond de génération (brief §4/§14). */
@Controller('admin/preview-settings')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminPreviewSettingsController {
  constructor(private readonly settings: PreviewSettingsService) {}

  @Get()
  get(): Promise<PreviewSettingsResponse> {
    return this.settings.get();
  }

  @Put()
  update(
    @Body() dto: UpdatePreviewSettingsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<PreviewSettingsResponse> {
    return this.settings.update(dto, admin.id);
  }
}
