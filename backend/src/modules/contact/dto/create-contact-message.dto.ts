import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

/** Mêmes libellés que le `<select>` du formulaire frontend — voir `contact-form.tsx`. */
export const CONTACT_SUBJECTS = [
  'Question générale',
  'Aide avec une commande',
  'Proposition éditoriale',
  'Autre demande',
] as const;

export class CreateContactMessageDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(2, 120, { message: 'Le nom doit compter entre 2 et 120 caractères.' })
  name!: string;

  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;

  @Transform(({ value }) => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsIn(CONTACT_SUBJECTS, { message: 'Sujet invalide.' })
  subject?: (typeof CONTACT_SUBJECTS)[number];

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(10, 4000, {
    message: 'Le message doit compter entre 10 et 4000 caractères.',
  })
  message!: string;
}
