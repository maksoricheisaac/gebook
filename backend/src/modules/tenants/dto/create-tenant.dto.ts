import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import type { TenantType } from '../../../generated/prisma/enums';
import { sanitizeRichText } from '../../../common/rich-text';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE =
  'Le slug ne peut contenir que des minuscules, chiffres et tirets.';

const TENANT_TYPES: TenantType[] = [
  'independent_author',
  'publishing_house',
  'collective',
  'cultural_organization',
];

export class CreateTenantDto {
  @Transform(({ value }): string => String(value ?? '').trim())
  @IsString()
  @Length(2, 150, {
    message: 'Le nom doit contenir entre 2 et 150 caractères.',
  })
  name!: string;

  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsIn(TENANT_TYPES, { message: 'Type d’espace invalide.' })
  type!: TenantType;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  @Transform(({ value }): string | undefined => sanitizeRichText(value))
  description?: string;

  /**
   * Acceptation des conditions de distribution en vigueur pour `type`
   * (mission plateforme de paiement, §17) : enregistrée dans la même
   * transaction que la création — jamais après coup, jamais silencieuse
   * (« l'utilisateur ne doit pas découvrir les conditions après une vente »).
   */
  @IsBoolean()
  @Equals(true, {
    message: 'Vous devez accepter les conditions de distribution.',
  })
  acceptTerms!: boolean;
}
