import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { FilesModule } from '../files/files.module';
import { AdminDistributionTermsController } from './admin-distribution-terms.controller';
import { AdminTenantsController } from './admin-tenants.controller';
import { DistributionTermsController } from './distribution-terms.controller';
import { DistributionTermsService } from './distribution-terms.service';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { TenantContextService } from './tenant-context.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantsController } from './tenants.controller';
import { TenantsPublicController } from './tenants-public.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, FilesModule, CommissionsModule],
  controllers: [
    TenantsController,
    TenantsPublicController,
    TeamController,
    TenantSettingsController,
    AdminTenantsController,
    DistributionTermsController,
    AdminDistributionTermsController,
  ],
  providers: [
    TenantsService,
    TenantContextService,
    TenantAccessGuard,
    TeamService,
    TenantSettingsService,
    DistributionTermsService,
    ActivityLogService,
  ],
  exports: [TenantContextService, TenantAccessGuard],
})
export class TenantsModule {}
