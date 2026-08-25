/**
 * Ce que l'API expose d'un utilisateur authentifié.
 *
 * Écrit à la main, comme les DTO du catalogue : `passwordHash` ne doit jamais
 * pouvoir sortir par accident parce que quelqu'un aura élargi une sélection Prisma.
 */
export interface AuthUserResponse {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  roles: string[];
}

export function toAuthUserResponse(user: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  roles: string[];
}): AuthUserResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roles: user.roles,
  };
}
