import { IsString, Length } from 'class-validator';

export class RequestPayoutDto {
  @IsString()
  @Length(1, 150)
  beneficiaryName!: string;

  @IsString()
  @Length(1, 100)
  beneficiaryCountry!: string;

  /** Numéro Mobile Money ou coordonnées bancaires — donnée sensible, jamais journalisée en clair. */
  @IsString()
  @Length(1, 190)
  beneficiaryAccount!: string;

  @IsString()
  @Length(1, 100)
  method!: string;
}

export class RejectPayoutDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}

export class MarkPayoutPaidDto {
  @IsString()
  @Length(0, 190)
  providerReference?: string;
}

export interface PayoutResponse {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  beneficiaryName: string;
  beneficiaryCountry: string;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  failureReason: string | null;
}

export interface PayoutBalanceResponse {
  availableBalance: string;
  currency: string;
  minThreshold: string | null;
  delayDays: number | null;
  belowThreshold: boolean;
}
