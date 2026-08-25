import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import type { TenantType } from '../../../generated/prisma/enums';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'Le slug ne peut contenir que des minuscules, chiffres et tirets.';

const TENANT_TYPES: TenantType[] = [
  'independent_author',
  'publishing_house',
  'collective',
  'cultural_organization',
];

export class CreateTenantDto {
  @Transform(({ value }): string => String(value ?? '').trim())
  @IsString()
  @Length(2, 150, {
    message: 'Le nom doit contenir entre 2 et 150 caractères.',
  })
  name!: string;

  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsIn(TENANT_TYPES, { message: 'Type d’espace invalide.' })
  type!: TenantType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
