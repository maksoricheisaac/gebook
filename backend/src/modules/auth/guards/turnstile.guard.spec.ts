import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { NodeEnvironment } from '../../../config/environment';
import type { TurnstileService } from '../turnstile.service';
import { TurnstileGuard } from './turnstile.guard';

function contextWithBody(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body, ip: '203.0.113.1', socket: {} }),
    }),
  } as unknown as ExecutionContext;
}

function configFor(nodeEnv: NodeEnvironment): ConfigService {
  return { getOrThrow: () => nodeEnv } as unknown as ConfigService;
}

describe('TurnstileGuard', () => {
  it('laisse toujours passer en NODE_ENV=test, sans appeler le service', async () => {
    const verify = jest.fn();
    const guard = new TurnstileGuard(
      { verify } as unknown as TurnstileService,
      configFor(NodeEnvironment.test),
    );

    await expect(guard.canActivate(contextWithBody({}))).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuse une requête sans jeton hors NODE_ENV=test', async () => {
    const verify = jest.fn();
    const guard = new TurnstileGuard(
      { verify } as unknown as TurnstileService,
      configFor(NodeEnvironment.production),
    );

    await expect(guard.canActivate(contextWithBody({}))).rejects.toThrow(
      BadRequestException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuse un jeton que le service juge invalide', async () => {
    const verify = jest.fn().mockResolvedValue(false);
    const guard = new TurnstileGuard(
      { verify } as unknown as TurnstileService,
      configFor(NodeEnvironment.production),
    );

    await expect(
      guard.canActivate(contextWithBody({ turnstileToken: 'jeton' })),
    ).rejects.toThrow(BadRequestException);
    expect(verify).toHaveBeenCalledWith('jeton', '203.0.113.1');
  });

  it('accepte un jeton valide', async () => {
    const verify = jest.fn().mockResolvedValue(true);
    const guard = new TurnstileGuard(
      { verify } as unknown as TurnstileService,
      configFor(NodeEnvironment.production),
    );

    await expect(
      guard.canActivate(contextWithBody({ turnstileToken: 'jeton' })),
    ).resolves.toBe(true);
  });
});
