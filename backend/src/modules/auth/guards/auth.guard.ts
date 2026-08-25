import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { SessionService } from '../session.service';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Résout le cookie de session en utilisateur authentifié.
 *
 * Équivalent de `AuthService::user()` en PHP, appliqué route par route plutôt que
 * globalement : le catalogue reste public, seules les routes qui en ont besoin
 * portent `@UseGuards(AuthGuard)`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];

    const user = token ? await this.sessions.resolve(token) : null;

    if (!user) {
      throw new UnauthorizedException(
        'Vous devez être connecté pour effectuer cette action.',
      );
    }

    request.user = user;
    return true;
  }
}
