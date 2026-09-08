/**
 * Décrit les champs d'identifiants attendus par chaque pilote — saisis depuis
 * Superadmin → Paiements → Configurer, chiffrés en base
 * (`payment_provider_credentials`) et lus via `ProviderConfigService`.
 *
 * Un nouveau prestataire n'exige jamais de migration ici (clé/valeur en base) :
 * seulement une entrée dans `PROVIDER_CREDENTIAL_SCHEMAS`, en plus de son
 * pilote — même règle que `payments.module.ts` : « ajouter un prestataire
 * consiste à écrire une classe et à l'enregistrer, aucun autre fichier ne
 * change » (ce fichier-ci excepté, puisque lui seul sait quels champs existent).
 */
export interface CredentialFieldSpec {
  /** Propre au prestataire (ex. `apiKey`, `siteId`) — jamais un nom de variable d'environnement. */
  key: string;
  /** Affiché dans le formulaire Superadmin. */
  label: string;
  /** `true` : champ mot de passe, jamais renvoyé — même en aperçu — par une route Superadmin. */
  secret: boolean;
  required: boolean;
  /** Variable `.env` de repli tant qu'aucune valeur n'est enregistrée en base — voir `ProviderConfigService.get()`. */
  envFallback?: string;
}

export const PROVIDER_CREDENTIAL_SCHEMAS: Record<
  string,
  readonly CredentialFieldSpec[]
> = {
  fake: [],
  cinetpay: [
    {
      key: 'apiUrl',
      label: "URL de l'API",
      secret: false,
      required: false,
      envFallback: 'CINETPAY_API_URL',
    },
    {
      key: 'apiKey',
      label: 'Clé API',
      secret: true,
      required: true,
      envFallback: 'CINETPAY_API_KEY',
    },
    {
      key: 'siteId',
      label: 'Identifiant du site',
      secret: false,
      required: true,
      envFallback: 'CINETPAY_SITE_ID',
    },
    {
      key: 'secretKey',
      label: 'Clé secrète (signature des notifications)',
      secret: true,
      required: true,
      envFallback: 'CINETPAY_SECRET_KEY',
    },
  ],
  feexpay: [
    {
      key: 'apiUrl',
      label: "URL de l'API",
      secret: false,
      required: false,
      envFallback: 'FEEXPAY_API_URL',
    },
    {
      key: 'apiKey',
      label: 'Clé API',
      secret: true,
      required: true,
      envFallback: 'FEEXPAY_API_KEY',
    },
    {
      key: 'shopId',
      label: 'Identifiant boutique',
      secret: false,
      required: true,
      envFallback: 'FEEXPAY_SHOP_ID',
    },
  ],
  pawapay: [
    {
      key: 'apiUrl',
      label: "URL de l'API",
      secret: false,
      required: false,
      envFallback: 'PAWAPAY_API_URL',
    },
    {
      key: 'apiToken',
      label: 'Jeton API',
      secret: true,
      required: true,
      envFallback: 'PAWAPAY_API_TOKEN',
    },
  ],
};

export function credentialFieldsFor(
  providerCode: string,
): readonly CredentialFieldSpec[] {
  return PROVIDER_CREDENTIAL_SCHEMAS[providerCode] ?? [];
}
