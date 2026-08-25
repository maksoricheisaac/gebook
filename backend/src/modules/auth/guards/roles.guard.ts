import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Vérifie les rôles après `AuthGuard`. Corrige l'anomalie relevée dans l'audit (§15) :
 * un utilisateur peut cumuler plusieurs rôles, et n'importe lequel des rôles requis
 * suffit à passer (règle métier n° 23).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const hasRole =
      request.user?.roles.some((role) => requiredRoles.includes(role)) ?? false;

    if (!hasRole) {
      throw new ForbiddenException("Vous n'avez pas accès à cette ressource.");
    }

    return true;
  }
}
