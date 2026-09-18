import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PayoutRequestStatus } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminPayoutsService } from './admin-payouts.service';
import {
  MarkPayoutPaidDto,
  PayoutResponse,
  RejectPayoutDto,
} from './dto/payout.dto';

/** Approbation/refus/versement des demandes de retrait — plateforme uniquement. */
@Controller('admin/payouts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminPayoutsController {
  constructor(private readonly payouts: AdminPayoutsService) {}

  @Get()
  list(
    @Query('status') status?: PayoutRequestStatus,
  ): Promise<PayoutResponse[]> {
    return this.payouts.list(status);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<PayoutResponse> {
    return this.payouts.approve(id, admin.id);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPayoutDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<PayoutResponse> {
    return this.payouts.reject(id, dto, admin.id);
  }

  @Patch(':id/mark-paid')
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPayoutPaidDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<PayoutResponse> {
    return this.payouts.markPaid(id, dto, admin.id);
  }
}
