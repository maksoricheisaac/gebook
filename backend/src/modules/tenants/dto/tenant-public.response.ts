import type { Tenant } from '../../../generated/prisma/client';

/**
 * Profil public d'un tenant (Phase 5, vitrine). Volontairement plus étroit
 * que `TenantProfileResponse` (back-office) : ni `id`, ni `status` n'ont de
 * valeur pour un visiteur, et exposer explicitement moins de champs qu'un
 * DTO d'administration évite qu'un futur champ interne s'y retrouve par
 * réflexe de copier-coller.
 */
export interface TenantPublicProfileResponse {
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoPath: string | null;
  coverPath: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
}

export function toTenantPublicProfile(
  tenant: Tenant,
): TenantPublicProfileResponse {
  return {
    slug: tenant.slug,
    name: tenant.name,
    type: tenant.type,
    description: tenant.description,
    logoPath: tenant.logoPath,
    coverPath: tenant.coverPath,
    website: tenant.website,
    socialLinks: (tenant.socialLinks as Record<string, string> | null) ?? null,
  };
}
