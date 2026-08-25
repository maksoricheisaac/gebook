import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import { LoginThrottleService } from './login-throttle.service';
import { SessionService, type CreatedSession } from './session.service';
import {
  toAuthUserResponse,
  type AuthUserResponse,
} from './dto/auth-user.response';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { AuthenticatedUser, RequestMeta } from './auth.types';

export interface AuthResult {
  user: AuthUserResponse;
  session: CreatedSession;
}

/** Rôle attribué à toute inscription publique — inchangé depuis la version PHP. */
const READER_ROLE = 'reader';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResult> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException({
        message: 'Les données envoyées sont invalides.',
        errors: {
          passwordConfirmation: ['Les mots de passe ne correspondent pas.'],
        },
      });
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà avec cette adresse e-mail.',
      );
    }

    const readerRole = await this.prisma.role.findUnique({
      where: { name: READER_ROLE },
      select: { id: true },
    });
    if (!readerRole) {
      // Ne peut arriver qu'en base mal initialisée (seed non exécuté) : reste une
      // erreur serveur, jamais une faute de l'utilisateur.
      throw new InternalServerErrorException(
        'Le rôle lecteur est absent de la base de données.',
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    // Transaction : un utilisateur sans rôle ne doit jamais exister (règle métier n° 24).
    // Si l'attribution du rôle échoue, la création de l'utilisateur est annulée avec.
    const user = await this.prisma.$transaction(async (tx) => {
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
        data: { userId: created.id, roleId: readerRole.id },
      });

      return created;
    });

    await this.logActivity(user.id, 'auth.register', meta);

    const session = await this.sessions.create(user.id, meta);

    return {
      user: toAuthUserResponse({ ...user, roles: [READER_ROLE] }),
      session,
    };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    if (
      (await this.throttle.isBlocked('email', dto.email)) ||
      (await this.throttle.isBlocked('ip', meta.ip))
    ) {
      throw new HttpException(
        'Trop de tentatives. Réessayez dans 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // `argon2.verify` échoue sur un hachage vide ou d'un autre format : traité comme
    // un mot de passe invalide plutôt que comme une erreur serveur.
    const passwordValid = user
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : false;

    if (!user || user.status !== UserStatus.active || !passwordValid) {
      await this.throttle.hit('email', dto.email);
      await this.throttle.hit('ip', meta.ip);
      // Message volontairement identique que le compte existe ou non — un attaquant
      // ne doit pas pouvoir énumérer les adresses e-mail inscrites (audit §16).
      await this.logActivity(user?.id ?? null, 'auth.login.failed', meta);
      throw new UnauthorizedException(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    }

    await this.throttle.clear('email', dto.email);
    await this.throttle.clear('ip', meta.ip);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.logActivity(user.id, 'auth.login.success', meta);

    const roles = await this.rolesFor(user.id);
    const session = await this.sessions.create(user.id, meta);

    return { user: toAuthUserResponse({ ...user, roles }), session };
  }

  /**
   * Modifie prénom/nom/e-mail du compte connecté — jamais son rôle ni son
   * statut, qui n'appartiennent pas à ce que « ses informations autorisées »
   * recouvre.
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    meta: RequestMeta,
  ): Promise<AuthUserResponse> {
    const updated = await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName ?? null,
          email: dto.email,
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'Un compte existe déjà avec cette adresse e-mail.',
          );
        }
        throw error;
      });

    await this.logActivity(userId, 'auth.profile.update', meta);

    const roles = await this.rolesFor(userId);
    return toAuthUserResponse({ ...updated, roles });
  }

  /**
   * Changement de mot de passe (compte déjà authentifié).
   *
   * Exige le mot de passe actuel — un jeton de session volé ne suffit pas à
   * lui seul à changer le mot de passe, il faut aussi connaître le secret
   * actuel (défense en profondeur, même logique que la reconfirmation à
   * l'inscription). Le nouveau mot de passe n'est jamais journalisé ni
   * renvoyé : seul son hachage argon2 est écrit en base (règle n° 24 —
   * `passwordHash` ne sort jamais d'un DTO de réponse).
   */
  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
    currentToken: string,
    meta: RequestMeta,
  ): Promise<void> {
    if (dto.newPassword !== dto.newPasswordConfirmation) {
      throw new BadRequestException({
        message: 'Les données envoyées sont invalides.',
        errors: {
          newPasswordConfirmation: ['Les mots de passe ne correspondent pas.'],
        },
      });
    }

    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    const currentValid = await argon2
      .verify(record.passwordHash, dto.currentPassword)
      .catch(() => false);
    if (!currentValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Toute autre session active est révoquée : un mot de passe changé doit
    // fermer l'accès à quiconque avait volé le précédent, immédiatement, pas
    // seulement à sa prochaine expiration naturelle. La session courante
    // survit — changer son mot de passe ne doit pas se déconnecter soi-même.
    await this.sessions.destroyAllForUser(user.id, currentToken);

    await this.logActivity(user.id, 'auth.password.change', meta);
  }

  async logout(
    token: string,
    userId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    await this.sessions.destroy(token);
    if (userId) {
      await this.logActivity(userId, 'auth.logout', meta);
    }
  }

  private async rolesFor(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });
    return userRoles.map((userRole) => userRole.role.name);
  }

  private async logActivity(
    userId: string | null,
    action: string,
    meta: RequestMeta,
  ): Promise<void> {
    // INSERT brut, pas `.create()` : voir le commentaire de
    // `ActivityLogService.record()` (même raison — éviter que le RETURNING
    // implicite d'un `.create()` exige un contexte RLS que ce point d'appel
    // n'a pas encore, en particulier lors d'un login échoué où `userId` est
    // `null` par construction).
    await this.prisma.$executeRaw`
      INSERT INTO activity_logs (id, user_id, action, ip_address, created_at)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${action}, ${meta.ip}, now())
    `;
  }
}
