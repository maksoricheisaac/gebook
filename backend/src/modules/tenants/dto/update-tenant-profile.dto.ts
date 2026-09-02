import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { sanitizeRichText } from '../../../common/rich-text';

export class SocialLinksDto {
  @IsOptional()
  @IsUrl({}, { message: 'Lien Facebook invalide.' })
  facebook?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Lien Instagram invalide.' })
  instagram?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Lien X (Twitter) invalide.' })
  x?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Lien YouTube invalide.' })
  youtube?: string;
}

export class UpdateTenantProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 150, {
    message: 'Le nom doit contenir entre 2 et 150 caractères.',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  @Transform(({ value }): string | undefined => sanitizeRichText(value))
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Adresse du site invalide.' })
  website?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
