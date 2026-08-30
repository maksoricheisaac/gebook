import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { TenantType } from '../../generated/prisma/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantsService } from './tenants.service';

/**
 * Répertoire des tenants pour un platform_admin — sélection d'un tenant
 * précis lors de la création d'une règle de commission ou de conditions de
 * distribution qui lui sont propres (mission plateforme de paiement, §12-15).
 */
@Controller('admin/tenants')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(
    @Query('search') search?: string,
  ): Promise<{ id: string; name: string; slug: string; type: TenantType }[]> {
    return this.tenants.listAllForAdmin(search);
  }
}
