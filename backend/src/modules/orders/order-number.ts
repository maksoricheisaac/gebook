import { randomInt } from 'node:crypto';

/**
 * Numéro de commande lisible et unique, du type `GB-20260813-4K7QZP`. La date
 * facilite le tri visuel côté support ; les six caractères aléatoires suffisent à
 * éviter les collisions du jour — la contrainte `UNIQUE` en base reste le filet de
 * sécurité en cas de coïncidence (voir `OrdersService.create`, qui retente).
 */
const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(): string {
  const date = new Date();
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');

  let randomPart = '';
  for (let i = 0; i < 6; i += 1) {
    randomPart += RANDOM_ALPHABET[randomInt(RANDOM_ALPHABET.length)];
  }

  return `GB-${datePart}-${randomPart}`;
}
