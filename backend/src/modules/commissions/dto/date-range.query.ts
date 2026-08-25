import { IsDateString, IsOptional } from 'class-validator';

/**
 * Période optionnelle pour les statistiques du tableau de bord.
 *
 * Bornes inclusives, en ISO 8601. Absentes toutes les deux : le service
 * retombe sur les 30 derniers jours (comportement historique de
 * `revenueTimeseries()`, conservé comme défaut plutôt que rendu obligatoire
 * pour ne pas casser un appel existant sans ces paramètres).
 */
export class DateRangeQuery {
  @IsOptional()
  @IsDateString({}, { message: 'La date de début est invalide.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date de fin est invalide.' })
  to?: string;
}
