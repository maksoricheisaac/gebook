import {
  PaymentRejectedByProvider,
  ProviderUnavailable,
  type PaymentProviderError,
} from '../provider-errors';

/**
 * Codes internes → message destiné au frontend. OpenPay ne documente que le
 * format `{ "error": "<texte libre>" }` et des codes HTTP : le texte du
 * prestataire n'est jamais relayé tel quel, il peut révéler la configuration
 * du compte.
 */
const UNAVAILABLE =
  'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.';

const USER_MESSAGES: Record<string, string> = {
  ERR_INVALID_API_KEY: UNAVAILABLE,
  ERR_ACCESS_DENIED: UNAVAILABLE,
  ERR_INVALID_PHONE_NUMBER:
    'Le numéro de téléphone est invalide pour cet opérateur.',
  ERR_INVALID_AMOUNT:
    'Le montant de la commande est refusé par le prestataire.',
  RATE_LIMIT_EXCEEDED:
    'Trop de demandes de paiement. Veuillez patienter un instant puis réessayer.',
  NOT_FOUND: 'Transaction introuvable chez le prestataire.',
  ERR_PROVIDER_REJECTED: 'La demande de paiement a été refusée.',
};

/** Le message d'erreur OpenPay est du texte libre : on n'y cherche que des mots-clés. */
const MESSAGE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/t[ée]l[ée]phone|phone/i, 'ERR_INVALID_PHONE_NUMBER'],
  [/montant|amount/i, 'ERR_INVALID_AMOUNT'],
];

export function classifyOpenPayCode(status: number, body: unknown): string {
  if (status === 401) return 'ERR_INVALID_API_KEY';
  if (status === 403) return 'ERR_ACCESS_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT_EXCEEDED';

  const message =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === 'string'
      ? ((body as Record<string, unknown>).error as string)
      : '';
  for (const [pattern, code] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return 'ERR_PROVIDER_REJECTED';
}

/**
 * - 5xx → `ProviderUnavailable` : **issue incertaine**, la demande a pu être
 *   prise en compte (le statut tranchera).
 * - tout le reste → refus définitif (`PaymentRejectedByProvider`).
 *
 * Le corps brut n'est jamais copié dans le message : seul le code interne l'est.
 */
export function openPayFailure(
  providerCode: string,
  status: number,
  body: unknown,
): PaymentProviderError {
  if (status >= 500) {
    return new ProviderUnavailable(providerCode, { status });
  }
  const code = classifyOpenPayCode(status, body);
  return new PaymentRejectedByProvider(
    providerCode,
    code,
    USER_MESSAGES[code] ?? USER_MESSAGES.ERR_PROVIDER_REJECTED,
    { status, code },
  );
}

export function rejection(
  providerCode: string,
  code: string,
): PaymentRejectedByProvider {
  return new PaymentRejectedByProvider(
    providerCode,
    code,
    USER_MESSAGES[code] ?? USER_MESSAGES.ERR_PROVIDER_REJECTED,
  );
}
