import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CategoryStatus } from '../../../../generated/prisma/enums';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'Le slug ne peut contenir que des minuscules, chiffres et tirets.';

/** Voir `WorkTranslationFieldsDto` (`work.dto.ts`) pour le raisonnement d'ensemble. */
export class CategoryTranslationFieldsDto {
  @IsString()
  @Length(1, 100)
  @Transform(({ value }): string => String(value ?? '').trim())
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateCategoryTranslationsDto {
  @ValidateNested()
  @Type(() => CategoryTranslationFieldsDto)
  fr!: CategoryTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryTranslationFieldsDto)
  en?: CategoryTranslationFieldsDto;
}

export class UpdateCategoryTranslationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryTranslationFieldsDto)
  fr?: CategoryTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryTranslationFieldsDto)
  en?: CategoryTranslationFieldsDto;
}

export class CreateCategoryDto {
  @ValidateNested()
  @Type(() => CreateCategoryTranslationsDto)
  translations!: CreateCategoryTranslationsDto;

  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;
}

export class UpdateCategoryDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCategoryTranslationsDto)
  translations?: UpdateCategoryTranslationsDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;
}
