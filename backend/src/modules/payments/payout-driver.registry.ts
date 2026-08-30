import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PAYOUT_DRIVER, type PayoutDriver } from './payout-driver';

/**
 * Registre des pilotes de reversement, miroir exact de `PaymentDriverRegistry`
 * côté pay-in : les pilotes se déclarent dans `PaymentsModule`, le registre les
 * indexe par code. Ajouter un prestataire de payout consiste à écrire une
 * classe et à l'ajouter à la liste enregistrée sous `PAYOUT_DRIVER` — aucun
 * autre fichier ne change (brief §22).
 */
@Injectable()
export class PayoutDriverRegistry {
  private readonly byCode: Map<string, PayoutDriver>;

  constructor(@Inject(PAYOUT_DRIVER) drivers: PayoutDriver[]) {
    this.byCode = new Map(drivers.map((driver) => [driver.code, driver]));
  }

  /**
   * Un prestataire présent en base mais sans pilote de payout installé est une
   * erreur de configuration du serveur, pas une erreur du client : 503 et non 400.
   */
  resolve(code: string): PayoutDriver {
    const driver = this.byCode.get(code);
    if (!driver) {
      throw new ServiceUnavailableException(
        'Ce moyen de reversement est momentanément indisponible.',
      );
    }
    return driver;
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }
}
