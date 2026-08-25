import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PAYMENT_DRIVER, type PaymentDriver } from './payment-driver';

/**
 * Remplace le `match` de la fabrique PHP par un registre alimenté par l'injection
 * de dépendances : les pilotes se déclarent dans `PaymentsModule`, le registre les
 * indexe par code. C'est ce que la conception PHP visait sans l'atteindre, faute de
 * conteneur d'injection (audit §33).
 */
@Injectable()
export class PaymentDriverRegistry {
  private readonly byCode: Map<string, PaymentDriver>;

  constructor(@Inject(PAYMENT_DRIVER) drivers: PaymentDriver[]) {
    this.byCode = new Map(drivers.map((driver) => [driver.code, driver]));
  }

  /**
   * Un prestataire présent en base mais sans pilote installé est une erreur de
   * configuration du serveur, pas une erreur du client : 503 et non 400.
   */
  resolve(code: string): PaymentDriver {
    const driver = this.byCode.get(code);
    if (!driver) {
      throw new ServiceUnavailableException(
        'Ce moyen de paiement est momentanément indisponible.',
      );
    }
    return driver;
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }
}
