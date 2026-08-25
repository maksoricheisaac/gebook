import { Transform } from 'class-transformer';
import { IsEmail, IsIn } from 'class-validator';
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

export class InviteMemberDto {
  @Transform(({ value }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;

  @IsIn(ASSIGNABLE_ROLES, { message: 'Rôle de tenant invalide.' })
  role!: TenantMemberRole;
}
