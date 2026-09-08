import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * Corps de `PUT /admin/payment-providers/:code/configuration` — identifiants
 * (chiffrés avant stockage, voir `ProviderConfigService.setMany()`) et
 * capacités/priorité en une seule requête, cohérent avec un unique bouton
 * « Enregistrer » côté Superadmin. Tous les champs sont optionnels : un champ
 * absent reste inchangé, jamais réinitialisé à sa valeur par défaut.
 */
export class UpdateProviderConfigurationDto {
  /** Clé/valeur du manifeste (`PROVIDER_CREDENTIAL_SCHEMAS`) — une valeur
   * vide ou absente laisse l'identifiant existant intact. */
  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  /** `sandbox` par défaut au seed (voir `schema.prisma`, `ProviderEnvironment`) ;
   * bascule vers `production` une fois de vrais identifiants renseignés. */
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  supportsMobileMoney?: boolean;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  supportsCard?: boolean;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  supportsRefund?: boolean;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  supportsPayout?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La priorité doit être un nombre entier.' })
  @Min(1, { message: 'La priorité doit être supérieure ou égale à 1.' })
  priority?: number;
}

/** Une valeur de type `string` par clé, tolérant les clés vides côté DTO —
 * `ProviderConfigService.setMany()` filtre déjà les valeurs vides. */
export function credentialValues(
  dto: UpdateProviderConfigurationDto,
): Record<string, string> {
  if (!dto.credentials) return {};
  const entries = Object.entries(dto.credentials).filter(
    ([, value]) => typeof value === 'string',
  );
  return Object.fromEntries(entries);
}
