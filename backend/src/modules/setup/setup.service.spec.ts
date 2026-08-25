import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { SetupService } from './setup.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SessionService } from '../auth/session.service';
import type { LoginThrottleService } from '../auth/login-throttle.service';
import type { ActivityLogService } from '../../common/activity-log.service';
import type { CreateSuperadminDto } from './dto/create-superadmin.dto';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hachage-simule'),
}));

const TEST_SETUP_TOKEN = 'jeton-de-test-suffisamment-long-pour-passer';

const dto: CreateSuperadminDto = {
  token: TEST_SETUP_TOKEN,
  firstName: 'Riche',
  lastName: 'Makso',
  email: 'riche@example.com',
  password: 'MotDePasse1',
  passwordConfirmation: 'MotDePasse1',
};

function buildService(overrides: {
  existingSuperadmin?: boolean;
  isBlocked?: boolean;
}): {
  service: SetupService;
  hit: jest.Mock;
  clear: jest.Mock;
  sessionsCreate: jest.Mock;
  logActivity: jest.Mock;
  userCreate: jest.Mock;
} {
  const hit = jest.fn();
  const clear = jest.fn();
  const sessionsCreate = jest.fn().mockResolvedValue({
    token: 'jeton-de-session',
    expiresAt: new Date(),
  });
  const logActivity = jest.fn();
  const userCreate = jest
    .fn()
    .mockResolvedValue({ id: 'user-1', ...dto, passwordHash: 'x' });

  const tx = {
    userRole: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides.existingSuperadmin ? { id: 'ur-1' } : null,
        ),
      create: jest.fn().mockResolvedValue({ id: 'ur-2' }),
    },
    user: { create: userCreate },
  };

  const prisma = {
    userRole: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides.existingSuperadmin ? { id: 'ur-1' } : null,
        ),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-admin' }) },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;

  const config = {
    getOrThrow: jest.fn().mockReturnValue(TEST_SETUP_TOKEN),
  } as unknown as ConfigService;

  const sessions = { create: sessionsCreate } as unknown as SessionService;

  const throttle = {
    isBlocked: jest.fn().mockResolvedValue(overrides.isBlocked ?? false),
    hit,
    clear,
  } as unknown as LoginThrottleService;

  const activityLog = { record: logActivity } as unknown as ActivityLogService;

  const service = new SetupService(
    prisma,
    config,
    sessions,
    throttle,
    activityLog,
  );

  return { service, hit, clear, sessionsCreate, logActivity, userCreate };
}

describe('SetupService', () => {
  it('refuse de dépasser la limite de tentatives', async () => {
    const { service } = buildService({ isBlocked: true });

    await expect(
      service.createSuperadmin(dto, { ip: '127.0.0.1' }),
    ).rejects.toThrow(HttpException);
  });

  it('refuse la création si un superadmin existe déjà, même avec le bon jeton', async () => {
    const { service, hit } = buildService({ existingSuperadmin: true });

    await expect(
      service.createSuperadmin(dto, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
    // Le jeton n'est même pas vérifié une fois l'assistant fermé.
    expect(hit).not.toHaveBeenCalled();
  });

  it('refuse un jeton invalide et compte la tentative', async () => {
    const { service, hit } = buildService({});

    await expect(
      service.createSuperadmin(
        { ...dto, token: 'mauvais-jeton' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(hit).toHaveBeenCalledWith('setup', '127.0.0.1');
  });

  it('crée le superadmin, ouvre une session et journalise, avec le bon jeton', async () => {
    const { service, clear, sessionsCreate, logActivity, userCreate } =
      buildService({});

    const result = await service.createSuperadmin(dto, { ip: '127.0.0.1' });

    expect(userCreate).toHaveBeenCalled();
    expect(result.user.roles).toEqual(['admin']);
    expect(sessionsCreate).toHaveBeenCalledWith('user-1', { ip: '127.0.0.1' });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'auth.setup.superadmin_created',
      }),
    );
    expect(clear).toHaveBeenCalledWith('setup', '127.0.0.1');
  });
});
