import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminActivityLogController } from './admin-activity-log.controller';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [AdminActivityLogController],
  providers: [ActivityLogService],
})
export class ActivityLogModule {}
