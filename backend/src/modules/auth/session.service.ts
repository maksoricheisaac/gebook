import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '../../generated/prisma/enums';
import { SESSION_TTL_DAYS } from './session-cookie';
import type { AuthenticatedUser, RequestMeta } from './auth.types';

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Sessions serveur révocables (audit §32).
 *
 * Le cookie ne porte qu'un jeton opaque à haute entropie ; seul son hachage SHA-256
 * est stocké, exactement comme un mot de passe. Une lecture de la base ne suffit pas
 * à reconstituer un cookie valide.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: RequestMeta): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent?.slice(0, 255),
        ipAddress: meta.ip,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Résout un jeton en utilisateur authentifié, ou `null`.
   *
   * Reproduit la garantie centrale de `AuthService::user()` en PHP (règle métier
   * n° 25) : un compte qui n'est plus actif perd son accès dès la requête suivante,
   * pas seulement à sa prochaine connexion. La session correspondante est purgée au
   * passage — elle ne redeviendra jamais valide même si le compte est réactivé.
   */
  async resolve(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: { include: { userRoles: { include: { role: true } } } },
      },
    });

    if (!session) {
      return null;
    }

    if (
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.active
    ) {
      await this.prisma.session
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      return null;
    }

    return {
      id: session.user.id,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      email: session.user.email,
      roles: session.user.userRoles.map((userRole) => userRole.role.name),
    };
  }

  async destroy(token: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  /**
   * Révoque toutes les sessions d'un compte, sauf `exceptToken` si fourni —
   * après un changement de mot de passe (`AuthService.changePassword()`),
   * quiconque avait volé l'ancien perd l'accès immédiatement, sans déconnecter
   * la session qui vient de faire le changement.
   */
  async destroyAllForUser(userId: string, exceptToken?: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(exceptToken && { tokenHash: { not: hashToken(exceptToken) } }),
      },
    });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
