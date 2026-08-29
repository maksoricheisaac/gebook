import { Controller, Get, Param } from '@nestjs/common';
import type { TenantPublicProfileResponse } from './dto/tenant-public.response';
import { TenantsService } from './tenants.service';

/**
 * Vitrine publique d'un tenant (Phase 5). Séparé de `TenantsController`
 * (`@UseGuards(AuthGuard)` au niveau de la classe) plutôt qu'une route de
 * plus dedans : aucune route ici n'exige de session, et
 * `/tenants/public/:slug` — au lieu de `/tenants/:slug` — évite tout risque
 * qu'un paramètre générique n'intercepte un jour `/tenants/me` selon l'ordre
 * d'enregistrement des routes.
 */
@Controller('tenants/public')
export class TenantsPublicController {
  constructor(private readonly tenants: TenantsService) {}

  @Get(':slug')
  findBySlug(
    @Param('slug') slug: string,
  ): Promise<TenantPublicProfileResponse> {
    return this.tenants.findPublicBySlug(slug);
  }
}
