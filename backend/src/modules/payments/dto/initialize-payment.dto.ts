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

  /**
   * Requis par les prestataires qui déclenchent eux-mêmes le paiement
   * (FeexPay : « request to pay » push USSD), au format international sans
   * signe « + » (ex. `242676600000000`) — jamais validé par des prestataires
   * qui exposent une page de paiement hébergée (Fake, CinetPay), qui
   * l'ignorent simplement s'il est fourni.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\d{8,20}$/, {
    message:
      'Le numéro de téléphone doit être au format international, chiffres uniquement.',
  })
  customerPhone?: string;

  /**
   * Code de canal propre au prestataire (ex. `mtn_cg` pour FeexPay) —
   * identifie l'opérateur et le pays choisis par le lecteur. Ignoré par les
   * prestataires qui n'en ont pas besoin.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Le code de canal est invalide.',
  })
  providerChannel?: string;
}
