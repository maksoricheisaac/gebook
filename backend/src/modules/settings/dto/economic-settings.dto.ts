import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Pourcentage à deux décimales maximum (0 à 100). */
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;
const PERCENT_MESSAGE =
  'Doit être un pourcentage positif (deux décimales maximum).';

/** Montant en devise, sans décimale (le franc CFA n'en utilise pas). */
const AMOUNT_PATTERN = /^\d{1,12}$/;
const AMOUNT_MESSAGE = 'Doit être un montant entier positif.';

export const PAYOUT_FREQUENCIES = [
  'manual',
  'weekly',
  'biweekly',
  'monthly',
] as const;
export type PayoutFrequency = (typeof PAYOUT_FREQUENCIES)[number];

export const PAYOUT_VALIDATION_MODES = ['manual', 'automatic'] as const;
export type PayoutValidationMode = (typeof PAYOUT_VALIDATION_MODES)[number];

/**
 * Tous les champs sont optionnels : seuls ceux transmis sont écrits (brief
 * §4 — « ne pas inventer de valeurs par défaut définitives »). Un champ
 * jamais configuré reste `null` côté lecture plutôt que de recevoir une
 * valeur choisie arbitrairement ici.
 */
export class UpdateEconomicSettingsDto {
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  payoutMinThreshold?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  payoutDelayDays?: number;

  @IsOptional()
  @Matches(PERCENT_PATTERN, { message: PERCENT_MESSAGE })
  payoutFeePercent?: string;

  @IsOptional()
  @IsIn(PAYOUT_FREQUENCIES)
  payoutFrequency?: PayoutFrequency;

  @IsOptional()
  @IsIn(PAYOUT_VALIDATION_MODES)
  payoutValidationMode?: PayoutValidationMode;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'Code devise ISO à trois lettres (ex. XAF).',
  })
  payoutCurrency?: string;

  /**
   * Estimation utilisée uniquement par le simulateur prix/revenus (§4) — le
   * frais réel du prestataire de paiement n'est connu qu'à la transaction.
   */
  @IsOptional()
  @Matches(PERCENT_PATTERN, { message: PERCENT_MESSAGE })
  simulatorProviderFeePercent?: string;
}

export interface EconomicSettingsResponse {
  payoutMinThreshold: string | null;
  payoutDelayDays: number | null;
  payoutFeePercent: string | null;
  payoutFrequency: PayoutFrequency | null;
  payoutValidationMode: PayoutValidationMode | null;
  payoutCurrency: string | null;
  simulatorProviderFeePercent: string | null;
  /** Clés jamais configurées — le fondateur doit encore trancher. */
  undefinedKeys: string[];
}
