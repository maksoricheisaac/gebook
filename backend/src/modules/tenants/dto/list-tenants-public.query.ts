import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Paramètres de l'annuaire public des espaces (`GET /tenants/public`). */
export class ListTenantsPublicQuery {
  /** Recherche par nom d'espace — insensible à la casse. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
