import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { AdminEconomicSettingsController } from './admin-economic-settings.controller';
import { AdminPreviewSettingsController } from './admin-preview-settings.controller';
import { EconomicSettingsService } from './economic-settings.service';
import { PreviewSettingsService } from './preview-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminEconomicSettingsController,
    AdminPreviewSettingsController,
  ],
  providers: [
    EconomicSettingsService,
    PreviewSettingsService,
    ActivityLogService,
  ],
  exports: [EconomicSettingsService, PreviewSettingsService],
})
export class SettingsModule {}
