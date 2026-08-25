import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from '../tenant-context';

/** Contexte attaché à la requête par `TenantAccessGuard`. N'a de sens que derrière ce guard. */
export const CurrentTenant = createParamDecorator(
  (_: unknown, context: ExecutionContext): TenantContext => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { tenantContext?: TenantContext }>();
    return request.tenantContext as TenantContext;
  },
);
