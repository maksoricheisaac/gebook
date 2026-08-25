import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Rôles autorisés sur une route. Un utilisateur peut cumuler plusieurs rôles
 * (règle métier n° 23) : `RolesGuard` accepte dès qu'un seul rôle correspond.
 */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
