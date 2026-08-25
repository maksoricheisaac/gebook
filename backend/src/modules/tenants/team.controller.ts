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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentTenant } from './decorators/current-tenant.decorator';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import type { TenantContext } from './tenant-context';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import type { TeamMemberResponse } from './dto/team-member.response';
import { TeamService } from './team.service';

/**
 * Gestion de l'équipe de l'espace actif (brief §7). Même garde que
 * `AdminAuthorsController`/`AdminWorksController` : `TenantAccessGuard` laisse
 * passer quiconque a un espace actif, le détail des permissions (qui peut
 * inviter/retirer qui) est vérifié dans `TeamService`, en miroir des policies
 * RLS `tenant_members_insert`/`_update`/`_delete`.
 */
@Controller('admin/team')
@UseGuards(AuthGuard, TenantAccessGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TeamMemberResponse[]> {
    return this.team.list(admin, tenant);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body() dto: InviteMemberDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TeamMemberResponse> {
    return this.team.invite(dto, admin, tenant);
  }

  @Patch(':memberId')
  updateRole(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TeamMemberResponse> {
    return this.team.updateRole(memberId, dto, admin, tenant);
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('memberId') memberId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    return this.team.remove(memberId, admin, tenant);
  }
}
