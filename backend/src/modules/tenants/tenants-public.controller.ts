import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListTenantsPublicQuery } from './dto/list-tenants-public.query';
import type {
  TenantPublicProfileResponse,
  TenantPublicSummaryResponse,
} from './dto/tenant-public.response';
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

  /**
   * Annuaire — déclaré avant `:slug` pour la même raison que `stats`/`:id`
   * ailleurs dans le back-office : sans ça, une requête sans slug (`GET
   * /tenants/public`) ne matcherait de toute façon aucune route ici, mais un
   * futur slug littéralement nommé pourrait un jour entrer en collision.
   */
  @Get()
  listPublic(
    @Query() query: ListTenantsPublicQuery,
  ): Promise<TenantPublicSummaryResponse[]> {
    return this.tenants.listPublic(query.q);
  }

  @Get(':slug')
  findBySlug(
    @Param('slug') slug: string,
  ): Promise<TenantPublicProfileResponse> {
    return this.tenants.findPublicBySlug(slug);
  }
}
