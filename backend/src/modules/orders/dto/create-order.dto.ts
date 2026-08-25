import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  workFormatId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number = 1;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, {
    message: 'La commande doit contenir au moins un article.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }): string => String(value ?? '').trim())
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryDistrict?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deliveryLandmark?: string;
}
