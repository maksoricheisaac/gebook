import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentTenant } from '../tenants/decorators/current-tenant.decorator';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import type { TenantContext } from '../tenants/tenant-context';
import {
  PayoutBalanceResponse,
  PayoutResponse,
  RequestPayoutDto,
} from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

/** Retraits de l'espace actif — même garde que `TenantSettingsController`. */
@Controller('admin/tenant/payouts')
@UseGuards(AuthGuard, TenantAccessGuard)
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('balance')
  balance(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<PayoutBalanceResponse> {
    return this.payouts.balance(tenant);
  }

  @Get()
  list(@CurrentTenant() tenant: TenantContext): Promise<PayoutResponse[]> {
    return this.payouts.listMine(tenant);
  }

  @Post()
  request(
    @Body() dto: RequestPayoutDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<PayoutResponse> {
    return this.payouts.request(dto, admin, tenant);
  }
}
