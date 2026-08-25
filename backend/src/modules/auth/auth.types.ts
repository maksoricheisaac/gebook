/** Utilisateur authentifié, tel qu'attaché à la requête par `AuthGuard`. */
export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  roles: string[];
}

/** Métadonnées de requête utiles à la session et à la journalisation. */
export interface RequestMeta {
  ip: string;
  userAgent?: string;
}
