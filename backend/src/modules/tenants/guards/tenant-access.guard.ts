import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ACTIVE_TENANT_COOKIE_NAME } from '../active-tenant-cookie';
import { TenantContextService } from '../tenant-context.service';
import type { TenantContext } from '../tenant-context';
import type { AuthenticatedUser } from '../../auth/auth.types';

/**
 * Porte d'entrée du back-office scopé tenant (`AdminAuthorsController` et,
 * progressivement, les autres modules admin — brief §7).
 *
 * Volontairement grossier : il ne vérifie qu'une appartenance active à UN
 * tenant (ou le statut platform_admin), jamais un rôle précis. Le détail
 * "quel rôle a le droit de faire quoi" reste porté par RLS (policies
 * `authors_insert`/`_update`/`_delete`, etc.) — le dupliquer ici créerait deux
 * sources de vérité qui pourraient diverger. Ce guard garde seulement les
 * inconnus dehors et alimente `@CurrentTenant()` pour le reste de la requête.
 *
 * S'exécute après `AuthGuard` : `request.user` est donc déjà garanti.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthenticatedUser; tenantContext?: TenantContext }
      >();

    const cookies = request.cookies as Record<string, string> | undefined;
    const resolved = await this.tenantContext.resolve(
      request.user as AuthenticatedUser,
      cookies?.[ACTIVE_TENANT_COOKIE_NAME],
    );

    if (!resolved.isPlatformAdmin && resolved.tenantId === null) {
      throw new ForbiddenException(
        "Aucun espace actif : sélectionnez une maison d'édition avant de continuer.",
      );
    }

    request.tenantContext = resolved;
    return true;
  }
}
