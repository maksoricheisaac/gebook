import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Réglages du Book Preview Sandbox — brief §4/§14 : nombre de pages gratuites
 * par mode, filigrane, plafond de génération. Contrairement au modèle
 * économique (§4 du brief précédent), des valeurs par défaut RAISONNABLES
 * sont ici explicitement demandées (§4 du présent brief : « Par défaut :
 * maxPages: 3/5 ») — appliquées tant qu'aucun superadmin ne les change,
 * jamais laissées vides.
 */
export class UpdatePreviewSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  maxPagesPublic?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  maxPagesReader?: number;

  @IsOptional()
  @IsBoolean()
  watermarkEnabled?: boolean;

  /** Plafond de pages réellement rendues à l'upload — même pour un mode
   * "illimité" (auteur/admin), au-delà duquel la génération s'arrête (brief
   * §6 : jamais de conversion illimitée). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRenderPages?: number;
}

export interface PreviewSettingsResponse {
  enabled: boolean;
  maxPagesPublic: number;
  maxPagesReader: number;
  watermarkEnabled: boolean;
  maxRenderPages: number;
}
