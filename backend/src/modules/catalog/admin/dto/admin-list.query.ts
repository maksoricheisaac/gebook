import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Pagination et recherche partagées par les listes d'administration du catalogue. */
export class AdminListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }): string => String(value ?? '').trim())
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le numéro de page doit être un entier.' })
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'La taille de page ne peut pas dépasser 100 éléments.' })
  perPage: number = 20;
}

export interface AdminPaginatedResponse<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

/**
 * Liste des œuvres, filtrable par auteur ou par catégorie — pages de détail
 * d'un auteur ou d'une catégorie (brief admin).
 */
export class AdminListWorksQuery extends AdminListQuery {
  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
