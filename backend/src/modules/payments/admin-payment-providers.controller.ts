import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import { UpdateProviderConfigurationDto } from './dto/update-provider-configuration.dto';
import { UpdateProviderStatusDto } from './dto/update-provider-status.dto';

/**
 * Superadmin → Paramètres → Paiements. Les identifiants (`credentials`) sont
 * chiffrés avant stockage (`EncryptionService`) et jamais renvoyés en clair —
 * `list()` n'expose que `hasValue` par champ, jamais la valeur elle-même.
 *
 * `status` (actif/inactif) reste une colonne ordinaire de `payment_providers`
 * relue à chaque paiement par `PaymentsService#resolveProvider` — l'activer ou
 * le désactiver ne demande donc aucune reconfiguration, juste ce PATCH.
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

  @Put(':code/configuration')
  setConfiguration(
    @Param('code') code: string,
    @Body() dto: UpdateProviderConfigurationDto,
  ): Promise<AdminPaymentProviderResponse> {
    return this.providers.setConfiguration(code, dto);
  }

  @Put(':code/default')
  setDefault(
    @Param('code') code: string,
  ): Promise<AdminPaymentProviderResponse> {
    return this.providers.setDefault(code);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('code') code: string): Promise<void> {
    return this.providers.remove(code);
  }

  @Post(':code/test-connection')
  @HttpCode(HttpStatus.OK)
  testConnection(
    @Param('code') code: string,
  ): Promise<AdminProviderConnectionTestResponse> {
    return this.providers.testConnection(code);
  }
}
