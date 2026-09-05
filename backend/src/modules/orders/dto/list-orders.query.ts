import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/enums';

const SORTABLE_FIELDS = ['createdAt', 'totalAmount', 'orderNumber'] as const;
export type OrderSortField = (typeof SORTABLE_FIELDS)[number];

export class ListOrdersQuery {
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

export class AdminListOrdersQuery extends ListOrdersQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Numéro de commande, e-mail ou nom du client — insensible à la casse. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sortBy?: OrderSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedOrdersResponse<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}
