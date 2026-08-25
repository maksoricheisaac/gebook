import type { CookieOptions } from 'express';

/**
 * Nom et attributs du cookie de session (audit §32).
 *
 * Le préfixe `__Host-` impose `Secure`, l'absence de `Domain` et `Path=/` — des
 * garanties que le navigateur applique lui-même. Il n'a de sens qu'en production,
 * où l'API sert forcément du HTTPS : en local, `Secure` empêcherait le cookie de
 * repartir vers l'API sur un simple `http://localhost`.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE_NAME = isProduction
  ? '__Host-gebook_session'
  : 'gebook_session';

export const SESSION_TTL_DAYS = 30;

export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/** Options du cookie « vidé » à la déconnexion : mêmes attributs, sans quoi le navigateur en garderait une trace. */
export function clearedSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}
