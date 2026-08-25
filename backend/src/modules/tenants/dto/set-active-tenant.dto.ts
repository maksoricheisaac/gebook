import { IsUUID } from 'class-validator';

export class SetActiveTenantDto {
  @IsUUID()
  tenantId!: string;
}
