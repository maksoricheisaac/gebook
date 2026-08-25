import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Limitation des tentatives de connexion, à double compteur (audit §32, corrige S-05).
 *
 * La version PHP ne limitait que par `sha256(email|ip)` : changer d'IP suffisait à
 * repartir de zéro sur le même compte. Ici, le compte et l'IP ont chacun leur propre
 * compteur, et le blocage s'applique si l'un des deux dépasse le seuil.
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlocked(
    scope: 'email' | 'ip' | 'setup',
    identifier: string,
  ): Promise<boolean> {
    const record = await this.prisma.loginAttempt.findUnique({
      where: { key: this.key(scope, identifier) },
    });

    if (!record || record.expiresAt <= new Date()) {
      return false;
    }

    return record.count >= MAX_ATTEMPTS;
  }

  async hit(
    scope: 'email' | 'ip' | 'setup',
    identifier: string,
  ): Promise<void> {
    const key = this.key(scope, identifier);
    const now = new Date();
    const existing = await this.prisma.loginAttempt.findUnique({
      where: { key },
    });

    if (existing && existing.expiresAt > now) {
      // Incrément atomique côté base : corrige la lecture-modification-écriture non
      // protégée de la version PHP.
      await this.prisma.loginAttempt.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return;
    }

    await this.prisma.loginAttempt.upsert({
      where: { key },
      update: { count: 1, expiresAt: new Date(now.getTime() + WINDOW_MS) },
      create: { key, count: 1, expiresAt: new Date(now.getTime() + WINDOW_MS) },
    });
  }

  async clear(
    scope: 'email' | 'ip' | 'setup',
    identifier: string,
  ): Promise<void> {
    await this.prisma.loginAttempt
      .delete({ where: { key: this.key(scope, identifier) } })
      .catch(() => undefined);
  }

  private key(scope: 'email' | 'ip' | 'setup', identifier: string): string {
    return createHash('sha256')
      .update(`${scope}:${identifier.toLowerCase()}`)
      .digest('hex');
  }
}
