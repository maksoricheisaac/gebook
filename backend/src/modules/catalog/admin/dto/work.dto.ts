import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DeliveryType,
  FileType,
  FormatType,
  WorkStatus,
} from '../../../../generated/prisma/enums';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'Le slug ne peut contenir que des minuscules, chiffres et tirets.';
/** Chaîne décimale à deux décimales maximum : jamais de nombre flottant pour un prix. */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const PRICE_MESSAGE =
  'Le prix doit être un nombre décimal positif (deux décimales maximum).';

/**
 * Un jeu de champs traduisibles pour UNE langue. Réutilisé pour `fr` et `en` :
 * le titre reste requis dans les deux cas, plutôt que d'avoir une variante
 * « partielle » pour l'anglais — le formulaire admin envoie toujours l'état
 * complet du champ, jamais un correctif partiel (Phase 1 « bilinguisme »).
 */
export class WorkTranslationFieldsDto {
  @IsString()
  @Length(1, 255)
  @Transform(({ value }): string => String(value ?? '').trim())
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tableOfContents?: string;
}

/** `fr` obligatoire à la création : c'est la langue de référence de la plateforme. */
export class CreateWorkTranslationsDto {
  @ValidateNested()
  @Type(() => WorkTranslationFieldsDto)
  fr!: WorkTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkTranslationFieldsDto)
  en?: WorkTranslationFieldsDto;
}

/**
 * En modification, chaque langue est indépendante : un PATCH qui ne contient
 * que `translations.en` ne touche jamais la ligne `fr` (upsert par locale
 * dans `AdminWorksService.update`).
 */
export class UpdateWorkTranslationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkTranslationFieldsDto)
  fr?: WorkTranslationFieldsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkTranslationFieldsDto)
  en?: WorkTranslationFieldsDto;
}

export class CreateWorkDto {
  @IsUUID()
  authorId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ValidateNested()
  @Type(() => CreateWorkTranslationsDto)
  translations!: CreateWorkTranslationsDto;

  @IsString()
  @MaxLength(280)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  isbn?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1400)
  publicationYear?: number;

  @IsOptional()
  @IsDateString()
  publicationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  edition?: string;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class UpdateWorkDto {
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWorkTranslationsDto)
  translations?: UpdateWorkTranslationsDto;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  isbn?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1400)
  publicationYear?: number;

  @IsOptional()
  @IsDateString()
  publicationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  edition?: string;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class CreateWorkFormatDto {
  @IsEnum(FormatType)
  formatType!: FormatType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @Matches(PRICE_PATTERN, { message: PRICE_MESSAGE })
  price!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  unlimitedStock?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsEnum(DeliveryType)
  deliveryType!: DeliveryType;
}

export class UpdateWorkFormatDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @Matches(PRICE_PATTERN, { message: PRICE_MESSAGE })
  price?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  unlimitedStock?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;
}

/**
 * Nature du fichier téléversé. `full` par défaut : c'était le seul cas géré
 * jusqu'à la phase 9, et les appels existants continuent donc de fonctionner
 * sans changement. `sample` sert les extraits gratuits, servis publiquement.
 */
export class UploadWorkFileDto {
  @IsOptional()
  @IsEnum(FileType, {
    message: 'Le type de fichier doit être « full » ou « sample ».',
  })
  fileType: FileType = FileType.full;
}
