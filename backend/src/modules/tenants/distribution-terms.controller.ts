import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  UseGuards,
} from '@nestjs/common';
import { TenantType } from '../../generated/prisma/enums';
import type { DistributionTerms } from '../../generated/prisma/client';
import { AuthGuard } from '../auth/guards/auth.guard';
import { DistributionTermsService } from './distribution-terms.service';

/**
 * Lecture des conditions de distribution en vigueur — utilisée par
 * `/creer-un-espace` pour afficher le texte à accepter avant la création
 * (brief §17). Authentifié seulement (`AuthGuard`) : aucune donnée sensible,
 * un lecteur doit pouvoir lire les conditions avant de créer son espace.
 */
@Controller('distribution-terms')
@UseGuards(AuthGuard)
export class DistributionTermsController {
  constructor(private readonly terms: DistributionTermsService) {}

  @Get(':tenantType')
  activeFor(
    @Param('tenantType', new ParseEnumPipe(TenantType)) tenantType: TenantType,
  ): Promise<DistributionTerms> {
    return this.terms.activeFor(tenantType);
  }
}
