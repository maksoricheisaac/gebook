import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/enums';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
