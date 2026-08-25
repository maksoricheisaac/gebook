import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { AdminCommissionRulesService } from './admin-commission-rules.service';
import { AdminCommissionsController } from './admin-commissions.controller';
import { AuthorRevenueController } from './author-revenue.controller';
import { CommissionsService } from './commissions.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminCommissionsController, AuthorRevenueController],
  providers: [
    CommissionsService,
    AdminCommissionRulesService,
    ActivityLogService,
  ],
  // Le module de paiement fige les répartitions dans sa propre transaction.
  exports: [CommissionsService],
})
export class CommissionsModule {}
