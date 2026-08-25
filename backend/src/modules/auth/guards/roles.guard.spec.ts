import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from '../auth.types';

function contextWithUser(
  user: AuthenticatedUser | undefined,
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const baseUser: AuthenticatedUser = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: null,
  email: 'jean@example.com',
  roles: ['reader'],
};

describe('RolesGuard', () => {
  it('laisse passer une route sans @Roles()', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextWithUser(baseUser))).toBe(true);
  });

  it('accepte dès qu’un seul rôle correspond (règle métier n° 23)', () => {
    const reflector = {
      getAllAndOverride: () => ['author', 'admin'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user: AuthenticatedUser = {
      ...baseUser,
      roles: ['reader', 'author'],
    };

    expect(guard.canActivate(contextWithUser(user))).toBe(true);
  });

  it('refuse un utilisateur dont aucun rôle ne correspond', () => {
    const reflector = {
      getAllAndOverride: () => ['admin'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextWithUser(baseUser))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse une requête sans utilisateur attaché', () => {
    const reflector = {
      getAllAndOverride: () => ['admin'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
