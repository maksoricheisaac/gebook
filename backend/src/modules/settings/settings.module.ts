import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { AdminEconomicSettingsController } from './admin-economic-settings.controller';
import { EconomicSettingsService } from './economic-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminEconomicSettingsController],
  providers: [EconomicSettingsService, ActivityLogService],
  exports: [EconomicSettingsService],
})
export class SettingsModule {}
