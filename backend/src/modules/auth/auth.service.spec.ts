import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailVerificationService } from './email-verification.service';
import type { LoginOtpService } from './login-otp.service';
import type { SessionService } from './session.service';
import type { LoginThrottleService } from './login-throttle.service';
import type { RegisterDto } from './dto/register.dto';

// `NODE_ENV=test` désactive le throttle anti-abus de `register()` (voir son
// commentaire) — évite d'avoir à simuler `isBlocked`/`hit` dans ces tests
// unitaires, qui portent sur l'atomicité de la transaction, pas le throttle.
const testConfig = {
  getOrThrow: jest.fn().mockReturnValue('test'),
} as unknown as ConfigService;

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hachage-simule'),
}));

const registerDto: RegisterDto = {
  firstName: 'Jeanne',
  lastName: 'Kimbangu',
  email: 'jeanne@example.com',
  password: 'MotDePasse1',
  passwordConfirmation: 'MotDePasse1',
  acceptTerms: true,
};

/**
 * Test unitaire, contrairement au reste de la suite : la garantie vérifiée ici — que
 * `register()` ne crée ni session ni journal si l'attribution du rôle échoue — est un
 * comportement du code applicatif, pas une contrainte que PostgreSQL fait respecter.
 * L'atomicité de `$transaction` elle-même est une garantie de Prisma, pas quelque
 * chose que ce test a besoin de reprouver (règle métier n° 24).
 */
describe('AuthService.register — échec de l’attribution du rôle', () => {
  it('ne crée ni session ni journal si le rôle ne peut pas être attribué', async () => {
    const roleAssignmentError = new Error('violation de contrainte simulée');

    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-1', ...registerDto }),
      },
      userRole: { create: jest.fn().mockRejectedValue(roleAssignmentError) },
    };

    const logActivity = jest.fn();

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-reader' }) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
      activityLog: { create: logActivity },
    } as unknown as PrismaService;

    const sessionsCreate = jest.fn();
    const sessions = { create: sessionsCreate } as unknown as SessionService;
    const throttle = {} as LoginThrottleService;
    const emailVerification = {
      send: jest.fn(),
    } as unknown as EmailVerificationService;
    const loginOtp = { send: jest.fn() } as unknown as LoginOtpService;

    const auth = new AuthService(
      prisma,
      sessions,
      throttle,
      emailVerification,
      loginOtp,
      testConfig,
    );

    await expect(
      auth.register(registerDto, { ip: '127.0.0.1' }),
    ).rejects.toThrow(roleAssignmentError);

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('refuse l’inscription si le rôle lecteur est absent de la base', async () => {
    const transaction = jest.fn();

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
      activityLog: { create: jest.fn() },
    } as unknown as PrismaService;

    const sessions = { create: jest.fn() } as unknown as SessionService;
    const throttle = {} as LoginThrottleService;
    const emailVerification = {
      send: jest.fn(),
    } as unknown as EmailVerificationService;
    const loginOtp = { send: jest.fn() } as unknown as LoginOtpService;

    const auth = new AuthService(
      prisma,
      sessions,
      throttle,
      emailVerification,
      loginOtp,
      testConfig,
    );

    await expect(
      auth.register(registerDto, { ip: '127.0.0.1' }),
    ).rejects.toThrow(InternalServerErrorException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
