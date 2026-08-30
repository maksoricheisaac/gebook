import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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

/**
 * Superadmin → Paramètres → Paiements (brief §9). Lecture seule sur ce qui est
 * dérivé de l'environnement — aucune route ici n'écrit un secret en base : s'il
 * n'existe que dans `.env`, l'interface ne doit pas prétendre le gérer.
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

  @Post(':code/test-connection')
  @HttpCode(HttpStatus.OK)
  testConnection(
    @Param('code') code: string,
  ): Promise<AdminProviderConnectionTestResponse> {
    return this.providers.testConnection(code);
  }
}
