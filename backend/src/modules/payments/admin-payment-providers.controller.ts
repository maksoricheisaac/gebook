import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminPaymentProvidersService,
  type AdminPaymentProviderResponse,
  type AdminProviderConnectionTestResponse,
} from './admin-payment-providers.service';
import { UpdateProviderStatusDto } from './dto/update-provider-status.dto';

/**
 * Superadmin → Paramètres → Paiements (brief §9). Lecture seule sur ce qui est
 * dérivé de l'environnement — aucune route ici n'écrit un secret en base : s'il
 * n'existe que dans `.env`, l'interface ne doit pas prétendre le gérer.
 *
 * `status` fait exception : ce n'est pas un secret, c'est une colonne de
 * `payment_providers` qui gate déjà `PaymentsService#resolveProvider` (un
 * prestataire `inactive` est refusé au moment de payer) — l'activer ou le
 * désactiver ne demande donc aucune reconfiguration, juste ce PATCH.
 */
@Controller('admin/payment-providers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminPaymentProvidersController {
  constructor(private readonly providers: AdminPaymentProvidersService) {}

  @Get()
  list(): Promise<AdminPaymentProviderResponse[]> {
    return this.providers.list();
  }

  @Patch(':code/status')
  updateStatus(
    @Param('code') code: string,
    @Body() dto: UpdateProviderStatusDto,
  ): Promise<AdminPaymentProviderResponse> {
    return this.providers.updateStatus(code, dto.status);
  }

  @Post(':code/test-connection')
  @HttpCode(HttpStatus.OK)
  testConnection(
    @Param('code') code: string,
  ): Promise<AdminProviderConnectionTestResponse> {
    return this.providers.testConnection(code);
  }
}
