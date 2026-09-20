import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import type { TenantContext } from '../tenants/tenant-context';
import type { PaginatedActivityLogResponse } from './dto/activity-log.response';
import { ListActivityLogQuery } from './dto/list-activity-log.query';

/**
 * Journal d'activité : un superadmin voit tout, un owner/admin de tenant ne
 * voit que son propre espace (policy RLS `activity_logs_select`). Même garde
 * que `TenantSettingsController` : `TenantAccessGuard` laisse passer aussi
 * bien un platform_admin qu'un membre de tenant, le détail du rôle étant
 * vérifié par `ActivityLogService.list`.
 */
@Controller('admin/logs')
@UseGuards(AuthGuard, TenantAccessGuard)
export class AdminActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get()
  list(
    @Query() query: ListActivityLogQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<PaginatedActivityLogResponse> {
    return this.activityLog.list(admin, tenant, query);
  }
}
