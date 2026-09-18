import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { SessionService } from '../session.service';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Résout le cookie de session s'il existe, sans jamais rejeter la requête —
 * pour les routes publiques qui adaptent leur réponse selon que le visiteur
 * est identifiable ou non (Book Preview Sandbox : un visiteur anonyme et un
 * lecteur connecté n'obtiennent pas la même politique de prévisualisation
 * sur la même route). Contrairement à `AuthGuard`, l'absence de session
 * n'est jamais une erreur ici — c'est un cas normal (`request.user`
 * simplement laissé `undefined`).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];

    if (token) {
      const user = await this.sessions.resolve(token);
      if (user) {
        request.user = user;
      }
    }

    return true;
  }
}
