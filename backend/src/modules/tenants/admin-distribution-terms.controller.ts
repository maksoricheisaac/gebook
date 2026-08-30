import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { DistributionTerms } from '../../generated/prisma/client';
import type { TenantType } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DistributionTermsService } from './distribution-terms.service';
import { CreateDistributionTermsDto } from './dto/distribution-terms.dto';

/**
 * Superadmin → Paramètres → Conditions de distribution (brief §16-19).
 */
@Controller('admin/distribution-terms')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminDistributionTermsController {
  constructor(private readonly terms: DistributionTermsService) {}

  @Get()
  list(
    @Query('tenantType') tenantType?: TenantType,
  ): Promise<DistributionTerms[]> {
    return this.terms.listForAdmin(tenantType);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  publish(
    @Body() dto: CreateDistributionTermsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<DistributionTerms> {
    return this.terms.publish(dto, admin.id);
  }
}
