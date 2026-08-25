import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Les 8 règles de validation de l'inscription (audit §16, §32).
 *
 * La CSRF de la version PHP n'a pas d'équivalent ici : elle est remplacée par
 * `sameSite=lax` et la vérification d'origine (`OriginGuard`), qui protègent la
 * requête elle-même plutôt qu'un champ du formulaire. Les 7 autres règles sont
 * reproduites à l'identique, avec les mêmes messages en français.
 */
export class RegisterDto {
  @Transform(({ value }): string => String(value ?? '').trim())
  @IsString()
  @Length(2, 80, {
    message: 'Le prénom doit contenir entre 2 et 80 caractères.',
  })
  firstName!: string;

  @Transform(({ value }): string | undefined => {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Le nom ne peut pas dépasser 80 caractères.' })
  lastName?: string;

  @Transform(({ value }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.',
  })
  password!: string;

  @IsString()
  passwordConfirmation!: string;

  @IsBoolean()
  @Equals(true, {
    message: 'Vous devez accepter les conditions d’utilisation.',
  })
  acceptTerms!: boolean;
}
