import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length } from 'class-validator';
import { TenantType } from '../../../generated/prisma/enums';

export class CreateDistributionTermsDto {
  @IsEnum(TenantType, { message: 'Type de tenant invalide.' })
  tenantType!: TenantType;

  @Transform(({ value }): string => String(value ?? '').trim())
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 20000, {
    message: 'Le contenu doit contenir entre 1 et 20 000 caractères.',
  })
  content!: string;
}
