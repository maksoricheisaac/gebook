import type { Prisma } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../src/prisma/rls-context';

/**
 * Les tests e2e lisent/écrivent directement en base pour préparer leurs
 * fixtures et vérifier l'état final (setup, cleanup, assertions), en dehors
 * de tout appel HTTP. Depuis la Phase 4 (RLS, `20260823020000_add_rls_policies`),
 * ces tables refusent tout accès sans contexte — exactement ce que ces tests
 * de sécurité vérifient par ailleurs (`multi-tenant-rls.e2e-spec.ts`).
 *
 * `adminDb` donne à ces fixtures/assertions une vue platform_admin, la même
 * autorité qu'un administrateur GeBook réel — jamais un contournement de RLS
 * en dehors d'une transaction explicite, donc sans le risque de fuite entre
 * requêtes déjà écarté pour `PrismaService.withRlsContext()`.
 */
export function adminDb<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.withRlsContext(SYSTEM_CONTEXT, fn);
}

/**
 * Version "proxy" de `adminDb` : un objet qui se comporte comme `prisma` lui-même
 * (`adminPrisma.work.findMany(...)`, `adminPrisma.order.deleteMany(...)`), mais
 * où chaque appel de méthode ouvre sa propre transaction platform_admin. Pensé
 * pour les fichiers de test qui font de nombreux appels directs de vérification/
 * nettoyage : un simple renommage `prisma.` → `adminPrisma.` suffit, sans
 * réécrire individuellement chaque site d'appel en `adminDb(prisma, (tx) => ...)`.
 *
 * Chaque appel = sa propre transaction (pas de composition entre plusieurs
 * appels) : suffisant pour des assertions/nettoyages de test indépendants,
 * pas destiné à exprimer une opération atomique multi-tables — utiliser
 * `adminDb(prisma, async (tx) => { ... })` pour ça.
 */
export function adminPrismaProxy(prisma: PrismaService): PrismaService {
  const modelCache = new Map<string, unknown>();
  return new Proxy(prisma, {
    get(target, modelName: string): unknown {
      if (typeof modelName !== 'string' || modelName.startsWith('$')) {
        return Reflect.get(target, modelName);
      }
      if (modelCache.has(modelName)) {
        return modelCache.get(modelName);
      }
      const methodProxy = new Proxy(
        {},
        {
          get(_methodTarget, methodName: string) {
            return (...args: unknown[]) =>
              prisma.withRlsContext(SYSTEM_CONTEXT, (tx) => {
                const model = (
                  tx as unknown as Record<
                    string,
                    Record<string, (...a: unknown[]) => unknown>
                  >
                )[modelName];
                return model[methodName](...args) as Promise<unknown>;
              });
          },
        },
      );
      modelCache.set(modelName, methodProxy);
      return methodProxy;
    },
  });
}
