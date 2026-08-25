import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import type { RlsContext } from './rls-context';

/**
 * Unique point de connexion à PostgreSQL, rattaché au cycle de vie NestJS.
 * Remplace le singleton statique `Database::connection()` de la version PHP.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion à la base de données établie.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Vérifie que la base répond réellement, pour la sonde de disponibilité. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(
        'La base de données ne répond pas.',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Positionne le contexte RLS (Phase 4) sur la transaction `tx` en cours, via
   * `set_config(nom, valeur, is_local => true)`. Portée par la transaction,
   * jamais par la connexion : le pool réutilise les connexions entre requêtes,
   * une portée non locale (`SET` simple) ferait fuiter le contexte d'une
   * requête vers la suivante. Ne PAS appeler en dehors d'une transaction —
   * `is_local => true` sans transaction active n'a aucun effet persistant, la
   * requête suivante verrait un contexte vide.
   *
   * Réutilisée telle quelle au tout début des blocs `$transaction(async (tx) =>
   * {...})` déjà existants (paiements, commandes) : un seul appel suffit pour
   * toute la transaction, pas la peine d'en ouvrir une nouvelle.
   */
  async applyRlsContext(
    tx: Prisma.TransactionClient,
    ctx: RlsContext,
  ): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId ?? ''}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId ?? ''}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', ${ctx.isPlatformAdmin ? 'true' : 'false'}, true)`;
  }

  /**
   * Ouvre une transaction dédiée, y positionne le contexte RLS, exécute `fn`,
   * puis referme la transaction. Pour les appels qui n'ont pas déjà une
   * transaction ouverte (la majorité des lectures/écritures simples) — pour
   * un service qui utilise déjà `this.prisma.$transaction(async (tx) => ...)`,
   * appeler `applyRlsContext(tx, ctx)` directement dans ce bloc existant
   * plutôt que d'en ouvrir un second ici (Prisma ne supporte pas les
   * transactions imbriquées).
   */
  async withRlsContext<T>(
    ctx: RlsContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await this.applyRlsContext(tx, ctx);
      return fn(tx);
    });
  }
}
