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

/** Ni identifiant en base (`payment_provider_credentials`) ni repli `.env` pour
 * ce champ — voir `ProviderConfigService.get()`. Distincte des erreurs
 * réseau/réponse ci-dessus : c'est une absence de configuration, pas un
 * incident chez le prestataire. */
export class MissingProviderCredentialError extends PaymentProviderError {
  constructor(providerCode: string, key: string) {
    super(
      `Identifiant « ${key} » manquant pour le prestataire « ${providerCode} ».`,
      providerCode,
    );
    this.name = 'MissingProviderCredentialError';
  }
}

/**
 * Refus **définitif** : la demande a été rejetée avant ou par le prestataire
 * (montant hors bornes, numéro invalide, clé refusée, solde insuffisant...).
 * Aucune somme n'a été prélevée, réessayer à l'identique ne sert à rien — à
 * l'inverse d'un timeout, où le prestataire a pu accepter la demande sans que
 * la réponse nous parvienne (`timeout ≠ échec`).
 *
 * `code` est un code métier interne stable (ex. `ERR_INVALID_AMOUNT`) ;
 * `userMessage` est le seul texte destiné au frontend : jamais le corps brut
 * du prestataire, jamais un détail technique.
 */
export class PaymentRejectedByProvider extends PaymentProviderError {
  constructor(
    providerCode: string,
    readonly code: string,
    readonly userMessage: string,
    cause?: unknown,
  ) {
    super(
      `Le prestataire « ${providerCode} » a refusé la demande (${code}).`,
      providerCode,
      cause,
    );
    this.name = 'PaymentRejectedByProvider';
  }
}

/**
 * Vrai lorsque l'issue d'une initiation est **incertaine** : le prestataire a
 * pu accepter la demande sans que nous l'ayons su. Le paiement local ne doit
 * alors surtout pas être marqué en échec ni relancé à l'aveugle.
 */
export function isUncertainProviderError(error: unknown): boolean {
  return (
    error instanceof ProviderTimeout ||
    error instanceof ProviderUnavailable ||
    error instanceof InvalidProviderResponse
  );
}
