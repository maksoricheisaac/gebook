import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/enums';

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
}

export interface PaginatedOrdersResponse<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}
