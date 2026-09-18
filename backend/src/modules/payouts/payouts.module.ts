import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminPayoutsService } from './admin-payouts.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [AuthModule, MailModule, SettingsModule, TenantsModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [PayoutsService, AdminPayoutsService, ActivityLogService],
})
export class PayoutsModule {}
