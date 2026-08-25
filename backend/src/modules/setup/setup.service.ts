import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { ActivityLogService } from '../../common/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import type { AuthResult } from '../auth/auth.service';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { SessionService } from '../auth/session.service';
import { toAuthUserResponse } from '../auth/dto/auth-user.response';
import type { RequestMeta } from '../auth/auth.types';
import type { CreateSuperadminDto } from './dto/create-superadmin.dto';

/** Rôle plateforme attribué par cet assistant — le « superadmin » de la matrice de rôles. */
const SUPERADMIN_ROLE = 'admin';

export interface SetupStatus {
  /** Vrai dès qu'un superadmin existe : l'assistant est alors définitivement fermé. */
  completed: boolean;
}

/**
 * Assistant de configuration initiale — crée le tout premier compte superadmin.
 *
 * Aucune route d'inscription publique ne doit jamais pouvoir produire un rôle
 * plateforme (`AuthService.register()` attribue toujours `reader`, en dur). Cette
 * route existe pour la seule exception légitime — le tout premier compte —, et se
 * ferme d'elle-même dès qu'un superadmin existe : le jeton `SETUP_TOKEN` protège
 * la fenêtre avant cette création, pas au-delà.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async status(): Promise<SetupStatus> {
    const existing = await this.prisma.userRole.findFirst({
      where: { role: { name: SUPERADMIN_ROLE } },
      select: { id: true },
    });
    return { completed: existing !== null };
  }

  async createSuperadmin(
    dto: CreateSuperadminDto,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    // Compte + IP, comme `AuthService.login()` : deviner le jeton doit rester aussi
    // coûteux que deviner un mot de passe, pas illimité parce qu'il n'y a pas de
    // compte à cibler ici.
    if (await this.throttle.isBlocked('setup', meta.ip)) {
      throw new HttpException(
        'Trop de tentatives. Réessayez dans 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Vérifié avant le jeton : une fois un superadmin créé, la route reste fermée
    // même si `SETUP_TOKEN` fuit plus tard (déploiement compromis, `.env` archivé
    // par erreur…). Le jeton protège la fenêtre de configuration, pas au-delà.
    if ((await this.status()).completed) {
      throw new ForbiddenException(
        'La configuration initiale a déjà été effectuée.',
      );
    }

    if (!this.tokenMatches(dto.token)) {
      await this.throttle.hit('setup', meta.ip);
      throw new UnauthorizedException('Jeton de configuration invalide.');
    }

    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException({
        message: 'Les données envoyées sont invalides.',
        errors: {
          passwordConfirmation: ['Les mots de passe ne correspondent pas.'],
        },
      });
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'Un compte existe déjà avec cette adresse e-mail.',
      );
    }

    const superadminRole = await this.prisma.role.findUnique({
      where: { name: SUPERADMIN_ROLE },
      select: { id: true },
    });
    if (!superadminRole) {
      throw new InternalServerErrorException(
        'Le rôle administrateur est absent de la base de données.',
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      // Recontrôlé dans la transaction : deux configurations lancées à la même
      // seconde avec le même jeton ne doivent pas produire deux superadmins.
      const stillNone = await tx.userRole.findFirst({
        where: { role: { name: SUPERADMIN_ROLE } },
        select: { id: true },
      });
      if (stillNone) {
        throw new ForbiddenException(
          'La configuration initiale a déjà été effectuée.',
        );
      }

      const created = await tx.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName ?? null,
          email: dto.email,
          passwordHash,
          status: UserStatus.active,
        },
      });

      await tx.userRole.create({
        data: { userId: created.id, roleId: superadminRole.id },
      });

      return created;
    });

    await this.throttle.clear('setup', meta.ip);
    await this.activityLog.record({
      userId: user.id,
      action: 'auth.setup.superadmin_created',
    });

    const session = await this.sessions.create(user.id, meta);

    return {
      user: toAuthUserResponse({ ...user, roles: [SUPERADMIN_ROLE] }),
      session,
    };
  }

  /**
   * Comparaison à temps constant : un opérateur qui mesure la latence de cette
   * route ne doit pas pouvoir en déduire le jeton caractère par caractère.
   */
  private tokenMatches(candidate: string): boolean {
    const expected = Buffer.from(this.config.getOrThrow<string>('SETUP_TOKEN'));
    const provided = Buffer.from(candidate);

    if (provided.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(provided, expected);
  }
}
