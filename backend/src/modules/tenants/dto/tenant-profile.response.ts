import type { Tenant } from '../../../generated/prisma/client';

export interface TenantProfileResponse {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoPath: string | null;
  coverPath: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
  status: string;
}

export function toTenantProfileResponse(tenant: Tenant): TenantProfileResponse {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    type: tenant.type,
    description: tenant.description,
    logoPath: tenant.logoPath,
    coverPath: tenant.coverPath,
    website: tenant.website,
    socialLinks: (tenant.socialLinks as Record<string, string> | null) ?? null,
    status: tenant.status,
  };
}
