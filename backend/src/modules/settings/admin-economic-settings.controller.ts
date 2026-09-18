import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EconomicSettingsService } from './economic-settings.service';
import {
  EconomicSettingsResponse,
  UpdateEconomicSettingsDto,
} from './dto/economic-settings.dto';

/** Réglages du modèle économique (retraits, simulateur) — brief « interface
 * de configuration du modèle économique », §4. Les commissions restent sur
 * `admin/commission-rules` (`AdminCommissionsController`), inchangé. */
@Controller('admin/economic-settings')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminEconomicSettingsController {
  constructor(private readonly settings: EconomicSettingsService) {}

  @Get()
  get(): Promise<EconomicSettingsResponse> {
    return this.settings.get();
  }

  @Put()
  update(
    @Body() dto: UpdateEconomicSettingsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<EconomicSettingsResponse> {
    return this.settings.update(dto, admin.id);
  }
}
