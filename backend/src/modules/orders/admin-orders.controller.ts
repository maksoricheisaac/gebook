import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AdminListOrdersQuery,
  type PaginatedOrdersResponse,
} from './dto/list-orders.query';
import type { AdminOrderResponse, OrderResponse } from './dto/order.response';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService, type AdminOrderStats } from './orders.service';

@Controller('admin/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Query() query: AdminListOrdersQuery,
  ): Promise<PaginatedOrdersResponse<AdminOrderResponse>> {
    return this.orders.listForAdmin(query);
  }

  @Get('stats')
  stats(): Promise<AdminOrderStats> {
    return this.orders.statsForAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<AdminOrderResponse> {
    return this.orders.findOneForAdmin(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<OrderResponse> {
    return this.orders.updateStatus(id, dto, admin.id);
  }
}
