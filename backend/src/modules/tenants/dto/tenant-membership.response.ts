import type { Tenant, TenantMember } from '../../../generated/prisma/client';

/**
 * Ce qu'un utilisateur voit de son appartenance à un tenant — jamais les
 * champs internes (`createdBy`, etc.) d'un tenant dont il n'est pas membre.
 */
export interface TenantMembershipResponse {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: string;
  role: string;
  status: string;
  /** Depuis quand ce membre appartient au tenant — sert de départage déterministe. */
  memberSince: string;
}

export function toTenantMembershipResponse(
  member: TenantMember & { tenant: Tenant },
): TenantMembershipResponse {
  return {
    tenantId: member.tenant.id,
    tenantName: member.tenant.name,
    tenantSlug: member.tenant.slug,
    tenantType: member.tenant.type,
    role: member.role,
    status: member.status,
    memberSince: member.createdAt.toISOString(),
  };
}
