import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class ResendLoginOtpDto {
  @Transform(({ value }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsEmail({}, { message: 'Saisissez une adresse e-mail valide.' })
  email!: string;
}
