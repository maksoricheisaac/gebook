import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class InitializePaymentDto {
  @IsString()
  @MaxLength(50)
  orderNumber!: string;

  /**
   * Facultatif : à défaut, le réglage `default_payment_provider` s'applique. Le
   * choix du prestataire est un réglage métier, pas une variable d'environnement
   * (audit §33 — « où vivent les secrets »).
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Le code du prestataire est invalide.',
  })
  @Transform(({ value }): string => String(value ?? '').trim())
  providerCode?: string;
}
