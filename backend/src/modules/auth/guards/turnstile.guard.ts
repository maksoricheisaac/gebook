import {
  BadRequestException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { NodeEnvironment } from '../../../config/environment';
import { TurnstileService } from '../turnstile.service';

/**
 * Vérifie le jeton Cloudflare Turnstile (« turnstileToken ») posé sur
 * `POST /auth/register` et `POST /auth/login` (pas l'étape OTP, second
 * facteur déjà protégé par `LoginThrottleService`). Lit `request.body`
 * directement : un guard s'exécute avant le `ValidationPipe`, le DTO n'est pas
 * encore construit à ce stade.
 *
 * Désactivé en `NODE_ENV=test` — même précédent que `LoginThrottleService`
 * dans `AuthService` — pour ne rien changer aux tests register/login
 * existants, qui n'ont aucun jeton Turnstile à fournir.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(
    private readonly turnstile: TurnstileService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.config.getOrThrow<NodeEnvironment>('NODE_ENV') ===
      NodeEnvironment.test
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as Record<string, unknown> | undefined;
    const token = body?.turnstileToken;

    if (typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException(
        'Vérification anti-robot manquante. Rechargez la page et réessayez.',
      );
    }

    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const valid = await this.turnstile.verify(token, ip);

    if (!valid) {
      throw new BadRequestException(
        'Vérification anti-robot invalide ou expirée. Rechargez la page et réessayez.',
      );
    }

    return true;
  }
}
