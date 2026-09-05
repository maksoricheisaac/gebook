import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Le jeton de vérification est obligatoire.' })
  token!: string;
}
