import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ACTIVE_TENANT_COOKIE_NAME,
  activeTenantCookieOptions,
  clearedActiveTenantCookieOptions,
} from './active-tenant-cookie';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { SetActiveTenantDto } from './dto/set-active-tenant.dto';
import type { TenantMembershipResponse } from './dto/tenant-membership.response';
import { TenantsService } from './tenants.service';

/**
 * Support backend du `TenantContext` frontend (Phase 5). Trois routes
 * volontairement minimales : lister ses appartenances, activer un tenant
 * (validé contre les memberships réels — jamais une confiance dans ce que le
 * client envoie), le désactiver. Aucune ne sert d'autorisation en soi : la
 * protection réelle des données reste RLS (Phase 4), câblée indépendamment de
 * ce module.
 */
@Controller('tenants')
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TenantMembershipResponse> {
    const membership = await this.tenants.create(dto, user);

    // Le nouvel espace devient actif immédiatement : sans ça, l'utilisateur
    // atterrirait sur /admin sans qu'aucun tenant ne soit sélectionné.
    response.cookie(
      ACTIVE_TENANT_COOKIE_NAME,
      membership.tenantId,
      activeTenantCookieOptions(),
    );

    return membership;
  }

  @Get('me')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantMembershipResponse[]> {
    return this.tenants.listMemberships(user);
  }

  @Post('me/active')
  @HttpCode(HttpStatus.OK)
  async setActive(
    @Body() dto: SetActiveTenantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TenantMembershipResponse> {
    const membership = await this.tenants.validateActiveTenant(
      user,
      dto.tenantId,
    );

    if (!membership) {
      throw new ForbiddenException(
        "Vous n'appartenez pas à cet espace, ou votre accès y est suspendu.",
      );
    }

    response.cookie(
      ACTIVE_TENANT_COOKIE_NAME,
      membership.tenantId,
      activeTenantCookieOptions(),
    );

    return membership;
  }

  @Post('me/active/clear')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearActive(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(
      ACTIVE_TENANT_COOKIE_NAME,
      clearedActiveTenantCookieOptions(),
    );
  }
}
