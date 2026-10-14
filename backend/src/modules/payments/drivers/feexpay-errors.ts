import {
  InvalidProviderResponse,
  PaymentRejectedByProvider,
  ProviderUnavailable,
  type PaymentProviderError,
} from '../provider-errors';

/**
 * Codes d'erreur FeexPay connus → message destiné au frontend. Le texte du
 * prestataire n'est jamais relayé tel quel : il peut révéler la configuration
 * de la boutique ou de l'API.
 */
const USER_MESSAGES: Record<string, string> = {
  ERR_INVALID_API_KEY:
    'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.',
  ERR_SHOP_NOT_FOUND:
    'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.',
  ERR_IP_NOT_AUTHORIZED:
    'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.',
  ERR_ACCESS_DENIED:
    'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.',
  ERR_PAYOUT_NOT_ENABLED:
    'Le service de paiement est momentanément indisponible. Veuillez réessayer plus tard.',
  ERR_INSUFFICIENT_BALANCE:
    'Solde insuffisant sur le compte Mobile Money. Rechargez-le puis réessayez.',
  ERR_INVALID_PHONE_NUMBER:
    'Le numéro de téléphone est invalide pour cet opérateur.',
  ERR_INVALID_AMOUNT:
    'Le montant de la commande est refusé par le prestataire.',
  ERR_NETWORK_UNAVAILABLE:
    "L'opérateur Mobile Money est indisponible pour le moment. Réessayez dans un instant.",
  ERR_TRANSACTION_FAILED: 'La transaction a été refusée. Veuillez réessayer.',
  RATE_LIMIT_EXCEEDED:
    'Trop de demandes de paiement. Veuillez patienter un instant puis réessayer.',
  NOT_FOUND: 'Transaction introuvable chez le prestataire.',
  MISSING_REFERENCE: 'Référence de transaction manquante.',
  ERR_PROVIDER_REJECTED: 'La demande de paiement a été refusée.',
};

/** Ordre significatif : le premier motif trouvé dans le code/message l'emporte. */
const CODE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/ERR_INVALID_API_KEY|INVALID_API_KEY/, 'ERR_INVALID_API_KEY'],
  [/ERR_SHOP_NOT_FOUND|SHOP_NOT_FOUND/, 'ERR_SHOP_NOT_FOUND'],
  [/ERR_IP_NOT_AUTHORIZED|IP_NOT_ALLOWED/, 'ERR_IP_NOT_AUTHORIZED'],
  [/ACCESS_DENIED/, 'ERR_ACCESS_DENIED'],
  [/ERR_INSUFFICIENT_BALANCE|INSUFFICIENT_BALANCE/, 'ERR_INSUFFICIENT_BALANCE'],
  [/ERR_INVALID_PHONE_NUMBER|INVALID_PHONE/, 'ERR_INVALID_PHONE_NUMBER'],
  [/ERR_INVALID_AMOUNT|INVALID_AMOUNT/, 'ERR_INVALID_AMOUNT'],
  [/ERR_NETWORK_UNAVAILABLE|NETWORK_UNAVAILABLE/, 'ERR_NETWORK_UNAVAILABLE'],
  [/ERR_DUPLICATE_TRANSACTION|DUPLICATE/, 'ERR_DUPLICATE_TRANSACTION'],
  [/ERR_PAYOUT_NOT_ENABLED|PAYOUT_NOT_ENABLED/, 'ERR_PAYOUT_NOT_ENABLED'],
  [/ERR_TRANSACTION_FAILED/, 'ERR_TRANSACTION_FAILED'],
  [/RATE_LIMIT/, 'RATE_LIMIT_EXCEEDED'],
  [/MISSING_REFERENCE/, 'MISSING_REFERENCE'],
];

function stringField(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.toUpperCase() : '';
}

/** Code métier interne déduit du statut HTTP et du corps de l'erreur. */
export function classifyFeexPayCode(status: number, body: unknown): string {
  const haystack = [
    stringField(body, 'code'),
    stringField(body, 'error'),
    stringField(body, 'message'),
  ].join(' ');

  for (const [pattern, code] of CODE_PATTERNS) {
    if (pattern.test(haystack)) return code;
  }

  if (status === 401) return 'ERR_INVALID_API_KEY';
  if (status === 403) return 'ERR_ACCESS_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT_EXCEEDED';
  return 'ERR_PROVIDER_REJECTED';
}

/**
 * Traduit une réponse d'erreur FeexPay (HTTP ≥ 400, ou HTTP 2xx portant
 * `success: false`) en erreur interne propre.
 *
 * - 5xx sans motif métier (502 Bad Gateway...) → `ProviderUnavailable` :
 *   **issue incertaine**, la demande a pu être prise en compte.
 * - `ERR_DUPLICATE_TRANSACTION` → issue incertaine aussi : FeexPay dit avoir
 *   déjà vu la demande, ce qui n'autorise ni à la marquer en échec ni à la
 *   relancer.
 * - tout le reste → refus définitif (`PaymentRejectedByProvider`).
 *
 * Le corps brut n'est jamais copié dans le message : seul le code interne l'est.
 */
export function feexPayFailure(
  providerCode: string,
  status: number,
  body: unknown,
): PaymentProviderError {
  const code = classifyFeexPayCode(status, body);

  if (code === 'ERR_DUPLICATE_TRANSACTION') {
    return new InvalidProviderResponse(providerCode, code);
  }
  if (status >= 500 && code === 'ERR_PROVIDER_REJECTED') {
    return new ProviderUnavailable(providerCode, { status, code });
  }
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
