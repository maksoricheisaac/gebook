import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundOrderDto {
  /**
   * Motif du remboursement, journalisé dans `activity_logs`. Facultatif, mais
   * fortement recommandé : c'est la seule trace de la raison d'un mouvement
   * d'argent, et elle sert autant à la comptabilité qu'au service client.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }): string => String(value ?? '').trim())
  reason?: string;
}
