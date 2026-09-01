import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import type { AuthenticatedUser } from '../auth/auth.types';
import { STORAGE_DRIVER, type StorageDriver } from '../files/storage-driver';
import {
  EXTENSION_BY_MIME,
  UploadValidatorService,
} from '../files/upload-validator.service';
import { TENANT_MANAGEMENT_ROLES } from './tenant-context';
import type { TenantContext } from './tenant-context';
import type { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import {
  toTenantProfileResponse,
  type TenantProfileResponse,
} from './dto/tenant-profile.response';

/** Aligné sur la policy RLS `tenants_update` : owner/admin, ou platform_admin. */
function assertCanManageSettings(tenant: TenantContext): void {
  if (tenant.isPlatformAdmin) {
    return;
  }
  if (!tenant.role || !TENANT_MANAGEMENT_ROLES.includes(tenant.role)) {
    throw new ForbiddenException(
      'Votre rôle ne permet pas de modifier les paramètres de cet espace.',
    );
  }
}

function requireTenantId(tenant: TenantContext): string {
  if (!tenant.tenantId) {
    throw new ForbiddenException(
      "Sélectionnez d'abord une maison d'édition active.",
    );
  }
  return tenant.tenantId;
}

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadValidator: UploadValidatorService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async get(
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    const tenantId = requireTenantId(tenant);

    const record = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) => tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!record) {
      throw new NotFoundException("Cet espace n'existe pas.");
    }
    return toTenantProfileResponse(record);
  }

  async update(
    dto: UpdateTenantProfileDto,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    assertCanManageSettings(tenant);
    const tenantId = requireTenantId(tenant);

    const updated = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && {
              description: dto.description,
            }),
            ...(dto.website !== undefined && { website: dto.website }),
            ...(dto.socialLinks !== undefined && {
              socialLinks: { ...dto.socialLinks },
            }),
          },
        }),
    );

    return toTenantProfileResponse(updated);
  }

  async updateLogo(
    file: Express.Multer.File,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    return this.updateImage(file, admin, tenant, 'logoPath', 'tenants/logos');
  }

  async updateCover(
    file: Express.Multer.File,
    admin: AuthenticatedUser,
    tenant: TenantContext,
  ): Promise<TenantProfileResponse> {
    return this.updateImage(file, admin, tenant, 'coverPath', 'tenants/covers');
  }

  private async updateImage(
    file: Express.Multer.File,
    admin: AuthenticatedUser,
    tenant: TenantContext,
    column: 'logoPath' | 'coverPath',
    directory: string,
  ): Promise<TenantProfileResponse> {
    assertCanManageSettings(tenant);
    const tenantId = requireTenantId(tenant);

    const mime = await this.uploadValidator.validateImage(file);
    const stored = await this.storage.storePublic(
      file.buffer,
      directory,
      EXTENSION_BY_MIME[mime],
    );

    const updated = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: { [column]: stored.storagePath },
        }),
    );

    return toTenantProfileResponse(updated);
  }
}
