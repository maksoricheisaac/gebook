import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, ActivityLogService],
})
export class OrdersModule {}
