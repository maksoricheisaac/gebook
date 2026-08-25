import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentLocale, FormatType } from '../../../generated/prisma/enums';

/**
 * Paramètres de recherche du catalogue public.
 *
 * La pagination est obligatoire côté serveur : l'ancienne version chargeait la
 * totalité du catalogue à chaque affichage, ce qui tenait uniquement parce qu'il
 * comptait quatre livres inventés.
 */
export class ListWorksQuery {
  /** Recherche libre sur le titre, le nom de l'auteur et la catégorie. */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La recherche est limitée à 100 caractères.' })
  @Transform(({ value }): string => String(value ?? '').trim())
  q?: string;

  /** Slug de catégorie. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  /** Slug d'auteur. */
  @IsOptional()
  @IsString()
  @MaxLength(180)
  author?: string;

  @IsOptional()
  @IsEnum(FormatType, {
    message:
      'Le format demandé doit être « pdf », « paper », « epub » ou « audio ».',
  })
  format?: FormatType;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le numéro de page doit être un entier.' })
  @Min(1, { message: 'Le numéro de page commence à 1.' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Plafond volontaire : sans lui, un `perPage=100000` transformerait une page
  // publique en moyen simple de saturer la base.
  @Max(48, { message: 'La taille de page ne peut pas dépasser 48 éléments.' })
  perPage: number = 12;

  /** Langue du contenu éditorial (titre, résumé…). `fr` par défaut. */
  @IsOptional()
  @IsEnum(ContentLocale)
  locale: ContentLocale = ContentLocale.fr;
}
