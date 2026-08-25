import type { CookieOptions } from 'express';

/**
 * Cookie "indicatif" du tenant actif (Phase 5).
 *
 * Volontairement PAS `httpOnly` : le `TenantProvider` côté client le lit pour
 * initialiser son état sans aller-retour réseau au chargement, et peut aussi
 * l'écrire de façon optimiste. Cela ne l'expose à aucun risque particulier —
 * ce n'est ni un secret, ni une preuve d'autorisation. Toute route qui en a
 * besoin le revalide contre `tenant_members` avant de s'y fier (brief §7,
 * `TenantsService.validateActiveTenant`) ; c'est PostgreSQL/RLS qui reste
 * l'autorité finale, jamais ce cookie.
 */
const isProduction = process.env.NODE_ENV === 'production';

export const ACTIVE_TENANT_COOKIE_NAME = 'gebook_active_tenant';

export function activeTenantCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    // Pas de date d'expiration courte : c'est une préférence d'affichage, pas
    // une session. Elle survit tant que le membership reste valide (revalidé
    // à chaque usage réel côté serveur).
    maxAge: 1000 * 60 * 60 * 24 * 365,
  };
}

export function clearedActiveTenantCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}
