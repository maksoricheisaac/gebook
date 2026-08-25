import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Créer le tout premier compte superadmin de la plateforme.
 *
 * Mêmes règles de validation que `RegisterDto` (identité, complexité du mot de
 * passe) — sans `acceptTerms`, qui n'a pas de sens pour un compte technique créé
 * par la personne qui déploie GeBook. `token` s'ajoute : c'est lui, et lui seul,
 * qui autorise cette route à créer un rôle plateforme au lieu du `reader` par
 * défaut (`SetupService.createSuperadmin`).
 */
export class CreateSuperadminDto {
  @IsString()
  @IsNotEmpty({ message: 'Le jeton de configuration est obligatoire.' })
  token!: string;

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
}
