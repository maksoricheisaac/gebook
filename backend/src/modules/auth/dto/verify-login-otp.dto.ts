import { Transform } from 'class-transformer';
import { IsEmail, Matches } from 'class-validator';

/** Chiffres uniquement après normalisation — les espaces que l'e-mail affiche
 * ("123 456") sont retirés avant validation, jamais avant l'affichage. */
const CODE_PATTERN = /^\d{6}$/;

export class VerifyLoginOtpDto {
  @Transform(({ value }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;

  @Transform(({ value }): string => String(value ?? '').replace(/\s+/g, ''))
  @Matches(CODE_PATTERN, { message: 'Le code doit contenir 6 chiffres.' })
  code!: string;
}
