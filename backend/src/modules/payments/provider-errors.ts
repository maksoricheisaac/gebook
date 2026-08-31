/**
 * Erreurs normalisées de prestataire (brief : « PaymentProviderError,
 * PayoutProviderError, ProviderTimeout, ProviderUnavailable,
 * InvalidProviderResponse — le frontend ne doit jamais recevoir de détails
 * internes »).
 *
 * Ces classes donnent aux pilotes un vocabulaire commun pour signaler ce qui
 * s'est mal passé chez le prestataire. Elles ne remplacent pas la garde déjà
 * en place dans `PaymentsService` (`catch` générique → `ServiceUnavailableException`
 * avec un message générique, jamais `error.message` renvoyé tel quel) : elles
 * s'y ajoutent, pour que les journaux serveur distinguent un vrai timeout
 * réseau d'une réponse JSON invalide plutôt que de tout voir comme une seule
 * erreur générique.
 */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly providerCode: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class PayoutProviderError extends Error {
  constructor(
    message: string,
    readonly providerCode: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PayoutProviderError';
  }
}

export class ProviderTimeout extends PaymentProviderError {
  constructor(providerCode: string) {
    super(
      `Le prestataire « ${providerCode} » n'a pas répondu à temps.`,
      providerCode,
    );
    this.name = 'ProviderTimeout';
  }
}

export class ProviderUnavailable extends PaymentProviderError {
  constructor(providerCode: string, cause?: unknown) {
    super(
      `Le prestataire « ${providerCode} » est momentanément indisponible.`,
      providerCode,
      cause,
    );
    this.name = 'ProviderUnavailable';
  }
}

export class InvalidProviderResponse extends PaymentProviderError {
  constructor(providerCode: string, detail: string) {
    super(
      `Réponse inattendue du prestataire « ${providerCode} » : ${detail}`,
      providerCode,
    );
    this.name = 'InvalidProviderResponse';
  }
}
