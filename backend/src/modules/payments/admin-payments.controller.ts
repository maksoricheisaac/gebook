import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { OrderResponse } from '../orders/dto/order.response';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PaymentsService } from './payments.service';

/**
 * Le remboursement vit dans le module de paiement et non dans celui des
 * commandes : il déplace de l'argent chez le prestataire avant de toucher quoi
 * que ce soit en base. `AdminOrdersController` ne connaît toujours aucun
 * prestataire (règle n° 22).
 */
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:id/refund')
  @HttpCode(HttpStatus.OK)
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundOrderDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<OrderResponse> {
    return this.payments.refund(id, dto, admin);
  }
}
