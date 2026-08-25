import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  ListOrdersQuery,
  type PaginatedOrdersResponse,
} from './dto/list-orders.query';
import type { OrderResponse } from './dto/order.response';
import { OrdersService } from './orders.service';

/**
 * Toute personne authentifiée peut commander : aucun `@Roles`, un compte lecteur
 * suffit (rôle attribué par défaut à l'inscription, voir `AuthService`).
 */
@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponse> {
    return this.orders.create(dto, user.id);
  }

  @Get('orders/me')
  listMine(
    @Query() query: ListOrdersQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedOrdersResponse<OrderResponse>> {
    return this.orders.listForUser(user.id, query);
  }

  @Get('orders/:orderNumber')
  findOne(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponse> {
    return this.orders.findByNumber(orderNumber, user);
  }
}
