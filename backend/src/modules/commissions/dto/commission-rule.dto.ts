import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import {
  CalculationBase,
  CommissionRuleStatus,
  CommissionType,
} from '../../../generated/prisma/enums';

/** Valeur décimale à quatre décimales : `commission_value` est un DECIMAL(12,4). */
const VALUE_PATTERN = /^\d{1,8}(\.\d{1,4})?$/;
const VALUE_MESSAGE =
  'La valeur doit être un nombre positif (quatre décimales maximum).';

export class CreateCommissionRuleDto {
  @IsString()
  @Length(1, 150)
  @Transform(({ value }): string => String(value ?? '').trim())
  name!: string;

  /** `null` ou absent désigne la règle générale, applicable à tous les auteurs. */
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsEnum(CommissionType)
  commissionType!: CommissionType;

  @Matches(VALUE_PATTERN, { message: VALUE_MESSAGE })
  commissionValue!: string;

  @IsEnum(CalculationBase)
  calculationBase!: CalculationBase;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(CommissionRuleStatus)
  status?: CommissionRuleStatus;
}

export class UpdateCommissionRuleDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  @Transform(({ value }): string => String(value ?? '').trim())
  name?: string;

  @IsOptional()
  @IsEnum(CommissionType)
  commissionType?: CommissionType;

  @IsOptional()
  @Matches(VALUE_PATTERN, { message: VALUE_MESSAGE })
  commissionValue?: string;

  @IsOptional()
  @IsEnum(CalculationBase)
  calculationBase?: CalculationBase;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(CommissionRuleStatus)
  status?: CommissionRuleStatus;
}

export class ListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 20;
}
