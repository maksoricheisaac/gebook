import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

/** Informations personnelles qu'un compte peut modifier lui-même — jamais son rôle. */
export class UpdateProfileDto {
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
}
