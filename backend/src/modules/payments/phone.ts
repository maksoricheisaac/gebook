/**
 * Ramène un numéro saisi librement (« +242 06 123 45 67 », « 00242-06... »)
 * à des chiffres seuls, préfixe pays inclus, sans « + » ni « 00 ». Ne devine
 * jamais un indicatif absent : un numéro local (`06...`) reste tel quel et
 * sera refusé par le pilote qui exige le format international.
 */
export function normalizePhoneDigits(raw: string): string {
  const compact = raw.replace(/[\s.\-()]/g, '');
  const withoutPlus = compact.startsWith('+') ? compact.slice(1) : compact;
  return withoutPlus.startsWith('00') ? withoutPlus.slice(2) : withoutPlus;
}

/**
 * Masque un numéro pour les journaux : garde l'indicatif pays (3 premiers
 * chiffres) et les 3 derniers, ex. `242******567`.
 */
export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '[absent]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 6) return '*'.repeat(digits.length);
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 6)}${digits.slice(-3)}`;
}
