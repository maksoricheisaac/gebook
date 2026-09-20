import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @Transform(({ value }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire.' })
  password!: string;

  /** Vérifié par `TurnstileGuard`, avant ce DTO — voir `RegisterDto.turnstileToken`. */
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
