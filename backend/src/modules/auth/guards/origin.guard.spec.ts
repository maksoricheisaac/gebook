import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { OriginGuard } from './origin.guard';

function contextFor(method: string, origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers: { origin } }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardWithAllowedOrigins(
  origins: string[],
  skipOriginCheck = false,
): OriginGuard {
  const config = { getOrThrow: () => origins } as unknown as ConfigService;
  const reflector = {
    getAllAndOverride: () => skipOriginCheck,
  } as unknown as Reflector;
  return new OriginGuard(config, reflector);
}

describe('OriginGuard', () => {
  const guard = guardWithAllowedOrigins(['http://localhost:3000']);

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'laisse passer les requêtes %s sans origine',
    (method) => {
      expect(guard.canActivate(contextFor(method))).toBe(true);
    },
  );

  it('accepte une écriture avec une origine autorisée', () => {
    expect(guard.canActivate(contextFor('POST', 'http://localhost:3000'))).toBe(
      true,
    );
  });

  it('refuse une écriture sans en-tête Origin', () => {
    expect(() => guard.canActivate(contextFor('POST'))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse une écriture depuis une origine non autorisée', () => {
    expect(() =>
      guard.canActivate(contextFor('POST', 'https://malveillant.example')),
    ).toThrow(ForbiddenException);
  });

  it('laisse passer une route explicitement dispensée, sans origine', () => {
    // Cas des notifications de paiement : aucune origine, sécurité portée par la
    // signature du prestataire (voir `SkipOriginCheck`).
    const webhookGuard = guardWithAllowedOrigins(
      ['http://localhost:3000'],
      true,
    );

    expect(webhookGuard.canActivate(contextFor('POST'))).toBe(true);
  });
});
