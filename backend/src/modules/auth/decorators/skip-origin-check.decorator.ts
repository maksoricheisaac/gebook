import { SetMetadata } from '@nestjs/common';

export const SKIP_ORIGIN_CHECK = 'skipOriginCheck';

/**
 * Dispense une route de la vérification d'origine.
 *
 * Réservée aux appels qui ne viennent pas d'un navigateur : une notification de
 * prestataire de paiement n'a ni cookie ni en-tête `Origin`, et sa sécurité repose
 * sur la signature du message, jamais sur son origine (audit §33).
 *
 * Toute nouvelle utilisation doit s'accompagner d'un moyen d'authentification de
 * remplacement explicite.
 */
export const SkipOriginCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ORIGIN_CHECK, true);
