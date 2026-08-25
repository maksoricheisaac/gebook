import type { TenantMember, User } from '../../../generated/prisma/client';

/** Ce qu'une équipe voit d'un de ses membres — jamais son mot de passe ni ses autres tenants. */
export interface TeamMemberResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: string;
  status: string;
  memberSince: string;
}

export function toTeamMemberResponse(
  member: TenantMember & {
    user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  },
): TeamMemberResponse {
  return {
    id: member.id,
    userId: member.user.id,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    email: member.user.email,
    role: member.role,
    status: member.status,
    memberSince: member.createdAt.toISOString(),
  };
}
