import { IsIn } from 'class-validator';

/**
 * Activation/désactivation d'un prestataire — jamais ses secrets, qui
 * restent exclusivement en `.env` (voir `AdminPaymentProvidersController`).
 * `status` est un champ de la table `payment_providers`, indépendant de la
 * configuration d'environnement : le déclarer inactif ne demande donc pas de
 * reconfigurer quoi que ce soit, seulement de changer cette valeur.
 */
export class UpdateProviderStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
