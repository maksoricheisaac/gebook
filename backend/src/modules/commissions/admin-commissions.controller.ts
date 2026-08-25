import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CommissionRule } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminCommissionRulesService } from './admin-commission-rules.service';
import { CommissionsService } from './commissions.service';
import {
  CreateCommissionRuleDto,
  ListQuery,
  UpdateCommissionRuleDto,
} from './dto/commission-rule.dto';
import { DateRangeQuery } from './dto/date-range.query';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminCommissionsController {
  constructor(
    private readonly rules: AdminCommissionRulesService,
    private readonly commissions: CommissionsService,
  ) {}

  @Get('commission-rules')
  list(@Query() query: ListQuery) {
    return this.rules.list(query);
  }

  @Post('commission-rules')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCommissionRuleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<CommissionRule> {
    return this.rules.create(dto, admin.id);
  }

  @Patch('commission-rules/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionRuleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<CommissionRule> {
    return this.rules.update(id, dto, admin.id);
  }

  @Delete('commission-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<void> {
    return this.rules.remove(id, admin.id);
  }

  /**
   * Chiffres du tableau de bord d'administration.
   *
   * Ils remplacent les valeurs codées en dur que l'audit relevait au §14 : tout
   * ce qui est affiché ici est désormais compté en base.
   */
  @Get('statistics')
  statistics(@Query() range: DateRangeQuery) {
    return this.commissions.platformStatistics(range);
  }

  /** Série pour le graphe du tableau de bord, sur la période demandée. */
  @Get('statistics/timeseries')
  timeseries(@Query() range: DateRangeQuery) {
    return this.commissions.revenueTimeseries(range);
  }
}
