import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AuthorStatus } from '../../../../generated/prisma/enums';
import { sanitizeRichText } from '../../../../common/rich-text';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'Le slug ne peut contenir que des minuscules, chiffres et tirets.';

/** Voir `WorkTranslationFieldsDto` (`work.dto.ts`) pour le raisonnement d'ensemble. */
export class AuthorTranslationFieldsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }): string | undefined => sanitizeRichText(value))
  biography?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortBiography?: string;
}

export class CreateAuthorTranslationsDto {
  @ValidateNested()
  @Type(() => AuthorTranslationFieldsDto)
  fr!: AuthorTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorTranslationFieldsDto)
  en?: AuthorTranslationFieldsDto;
}

export class UpdateAuthorTranslationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorTranslationFieldsDto)
  fr?: AuthorTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorTranslationFieldsDto)
  en?: AuthorTranslationFieldsDto;
}

export class CreateAuthorDto {
  @IsString()
  @Length(1, 150)
  @Transform(({ value }): string => String(value ?? '').trim())
  penName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsString()
  @MaxLength(180)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAuthorTranslationsDto)
  translations?: CreateAuthorTranslationsDto;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse e-mail publique est invalide." })
  publicEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  publicPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payoutPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutMethod?: string;

  @IsOptional()
  @IsEnum(AuthorStatus)
  status?: AuthorStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UpdateAuthorDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  @Transform(({ value }): string => String(value ?? '').trim())
  penName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAuthorTranslationsDto)
  translations?: UpdateAuthorTranslationsDto;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsEmail({}, { message: "L'adresse e-mail publique est invalide." })
  publicEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  publicPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payoutPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payoutMethod?: string;

  @IsOptional()
  @IsEnum(AuthorStatus)
  status?: AuthorStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
