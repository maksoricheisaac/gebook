import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_ORIGIN_CHECK } from '../decorators/skip-origin-check.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Vérification d'origine sur toutes les méthodes d'écriture (audit §32).
 *
 * Le CSRF change de nature avec un cookie de session et une API séparée du frontend :
 * la défense combine `sameSite=lax`, un CORS restrictif, et cette vérification de
 * l'en-tête `Origin`, qu'un navigateur ne laisse jamais falsifier depuis JavaScript.
 *
 * Global, et non limité aux routes d'authentification : n'importe quelle future route
 * d'écriture en bénéficie sans avoir à y penser. Les webhooks de paiement (phase 8),
 * qui n'ont ni cookie ni origine, devront explicitement s'en exclure — leur sécurité
 * reposera sur la signature du prestataire, jamais sur l'origine.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORIGIN_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const origin = request.headers.origin;
    const allowedOrigins = this.config.getOrThrow<string[]>('CORS_ORIGINS');

    if (!origin || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Origine de la requête non autorisée.');
    }

    return true;
  }
}
