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
  TenantType,
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

  /**
   * Au plus un des trois champs de portée ci-dessous peut être renseigné —
   * `chk_commission_rules_scope` porte la même règle en base. `null`/absent
   * partout désigne la règle générale, applicable à tous.
   */
  @IsOptional()
  @IsUUID()
  authorId?: string;

  /** Portée « propre à un tenant » (mission plateforme de paiement, §12-15). */
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  /** Portée « par type de tenant ». */
  @IsOptional()
  @IsEnum(TenantType)
  tenantType?: TenantType;

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
  @IsUUID()
  authorId?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsEnum(TenantType)
  tenantType?: TenantType;

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
