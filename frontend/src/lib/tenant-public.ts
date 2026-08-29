import { apiFetch } from "./api";

/**
 * Profil public d'un tenant (Phase 5, vitrine). Distinct de `TenantMembership`
 * (`tenant-shared.ts`, back-office) : ce type ne porte que ce qu'un visiteur
 * anonyme a le droit de voir, reflet de `TenantPublicProfileResponse` côté API.
 */
export interface TenantPublicProfile {
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoPath: string | null;
  coverPath: string | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
}

/** Même cache léger que le reste du catalogue public (`catalog.ts`). */
const TENANT_REVALIDATE = 60;

export function fetchTenantPublicProfile(slug: string): Promise<TenantPublicProfile> {
  return apiFetch<TenantPublicProfile>(`/tenants/public/${encodeURIComponent(slug)}`, {
    revalidate: TENANT_REVALIDATE,
  });
}
