import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import {
  CommissionsService,
  type AuthorRevenueResponse,
  type RevenueTimeseriesPoint,
} from './commissions.service';
import { ListQuery } from './dto/commission-rule.dto';
import { DateRangeQuery } from './dto/date-range.query';

/**
 * Revenus de l'auteur connecté.
 *
 * L'auteur est retrouvé par `authors.user_id`, jamais par un identifiant reçu du
 * client : un auteur ne doit pouvoir consulter que ses propres ventes. Un compte
 * sans fiche d'auteur rattachée n'a rien à voir ici (règle n° 4 — un auteur peut
 * exister sans compte, et un compte peut exister sans fiche d'auteur).
 */
@Controller('authors/me')
@UseGuards(AuthGuard)
export class AuthorRevenueController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
  ) {}

  @Get('sales')
  async sales(
    @Query() query: ListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commissions.listSales(
      await this.authorIdOf(user),
      query,
      buildRlsContext(user),
    );
  }

  @Get('revenue')
  async revenue(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthorRevenueResponse> {
    return this.commissions.revenue(
      await this.authorIdOf(user),
      buildRlsContext(user),
    );
  }

  @Get('sales/timeseries')
  async salesTimeseries(
    @Query() range: DateRangeQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevenueTimeseriesPoint[]> {
    return this.commissions.authorRevenueTimeseries(
      await this.authorIdOf(user),
      buildRlsContext(user),
      range,
    );
  }

  private async authorIdOf(user: AuthenticatedUser): Promise<string> {
    // `findFirst`, pas `findUnique` : depuis le V2, un même utilisateur peut avoir
    // un profil auteur dans plusieurs tenants (`[tenantId, userId]` n'est plus
    // globalement unique sur `userId` seul). Cette route ne désambiguïse pas
    // encore entre plusieurs tenants — c'est l'objet de la Phase 5/13
    // (TenantContext + sélection du tenant actif dans l'espace auteur).
    // La policy `authors_select` (RLS) rend un profil `status='active'`
    // visible sans contexte, donc cette lecture n'a pas besoin d'un contexte
    // dédié — mais `listSales`/`revenue` juste après en ont un (`sale_distributions`).
    const author = await this.prisma.author.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!author) {
      throw new ForbiddenException(
        'Aucune fiche d’auteur n’est rattachée à votre compte.',
      );
    }

    return author.id;
  }
}
