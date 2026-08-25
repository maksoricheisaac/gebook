import { IsIn } from 'class-validator';
import type { TenantMemberRole } from '../../../generated/prisma/enums';

const ASSIGNABLE_ROLES: TenantMemberRole[] = [
  'owner',
  'admin',
  'editor',
  'author',
  'marketing',
  'finance',
  'viewer',
];

export class UpdateMemberRoleDto {
  @IsIn(ASSIGNABLE_ROLES, { message: 'Rôle de tenant invalide.' })
  role!: TenantMemberRole;
}
