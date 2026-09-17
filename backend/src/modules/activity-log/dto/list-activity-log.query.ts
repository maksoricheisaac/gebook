import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Pagination et filtres de la lecture du journal d'activité (`ActivityLogService.list`). */
export class ListActivityLogQuery {
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

  @IsOptional()
  @IsString()
  @MaxLength(150)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  /** Filtre par tenant — ignoré pour un owner/admin de tenant, qui ne voit déjà que le sien. */
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
