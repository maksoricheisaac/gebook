import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { FilesModule } from '../files/files.module';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { TenantContextService } from './tenant-context.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, FilesModule, CommissionsModule],
  controllers: [TenantsController, TeamController, TenantSettingsController],
  providers: [
    TenantsService,
    TenantContextService,
    TenantAccessGuard,
    TeamService,
    TenantSettingsService,
    ActivityLogService,
  ],
  exports: [TenantContextService, TenantAccessGuard],
})
export class TenantsModule {}
