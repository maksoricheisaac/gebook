import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import type { PaymentResponse } from './dto/payment.response';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { PaymentsService } from './payments.service';

/**
 * Routes de paiement destinées au lecteur connecté. Aucun rôle particulier :
 * chacun paie ses propres commandes, la propriété étant vérifiée dans le service.
 */
@Controller()
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  initialize(
    @Body() dto: InitializePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResponse> {
    return this.payments.initialize(dto, user);
  }

  @Get('orders/:orderNumber/payments')
  listForOrder(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResponse[]> {
    return this.payments.listForOrder(orderNumber, user);
  }

  /** Réservée au prestataire factice et interdite en production. */
  @Post('payments/:id/simulate')
  @HttpCode(HttpStatus.OK)
  simulate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ received: true }> {
    return this.payments.simulate(id, dto, user);
  }
}
