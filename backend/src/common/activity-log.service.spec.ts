import { ForbiddenException } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import type { TenantContext } from '../modules/tenants/tenant-context';

const admin: AuthenticatedUser = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: null,
  email: 'jean@example.com',
  roles: ['reader'],
};

function fakePrisma(rows: unknown[] = []) {
  return {
    withRlsContext: (
      _ctx: unknown,
      callback: (tx: {
        activityLog: {
          count: () => Promise<number>;
          findMany: () => Promise<unknown[]>;
        };
      }) => unknown,
    ) =>
      callback({
        activityLog: {
          count: () => Promise.resolve(rows.length),
          findMany: () => Promise.resolve(rows),
        },
      }),
  };
}

const baseQuery = { page: 1, perPage: 20 };

describe('ActivityLogService.list', () => {
  it("refuse un membre de tenant dont le rôle n'est ni owner ni admin (policy RLS activity_logs_select)", async () => {
    const service = new ActivityLogService(fakePrisma() as never);
    const tenant: TenantContext = {
      tenantId: 'tenant-1',
      role: 'editor',
      isPlatformAdmin: false,
    };

    await expect(service.list(admin, tenant, baseQuery)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuse un membre sans tenant actif', async () => {
    const service = new ActivityLogService(fakePrisma() as never);
    const tenant: TenantContext = {
      tenantId: null,
      role: null,
      isPlatformAdmin: false,
    };

    await expect(service.list(admin, tenant, baseQuery)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('laisse passer un owner de tenant', async () => {
    const service = new ActivityLogService(fakePrisma() as never);
    const tenant: TenantContext = {
      tenantId: 'tenant-1',
      role: 'owner',
      isPlatformAdmin: false,
    };

    await expect(service.list(admin, tenant, baseQuery)).resolves.toMatchObject(
      { meta: { total: 0 } },
    );
  });

  it('laisse passer un platform_admin sans tenant actif', async () => {
    const service = new ActivityLogService(fakePrisma() as never);
    const tenant: TenantContext = {
      tenantId: null,
      role: null,
      isPlatformAdmin: true,
    };

    await expect(service.list(admin, tenant, baseQuery)).resolves.toMatchObject(
      { meta: { total: 0 } },
    );
  });
});

describe('ActivityLogService.recordForOrder', () => {
  it('écrit une ligne par tenant distinct présent dans la commande (panier multi-tenant)', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const service = new ActivityLogService({
      $executeRaw: executeRaw,
    } as never);

    await service.recordForOrder(
      {
        userId: admin.id,
        action: 'order.create',
        entityType: 'order',
        entityId: 'order-1',
      },
      [
        { tenantId: 'tenant-a' },
        { tenantId: 'tenant-b' },
        { tenantId: 'tenant-a' },
      ],
    );

    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it("n'écrit rien si la commande n'a aucune ligne", async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const service = new ActivityLogService({
      $executeRaw: executeRaw,
    } as never);

    await service.recordForOrder(
      {
        userId: admin.id,
        action: 'order.create',
        entityType: 'order',
        entityId: 'order-1',
      },
      [],
    );

    expect(executeRaw).not.toHaveBeenCalled();
  });
});
