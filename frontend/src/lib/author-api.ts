"use client";

/**
 * Client HTTP de l'espace auteur, côté navigateur.
 *
 * Passe par `/api/author/*` (voir `app/api/author/[...path]/route.ts`), le
 * relais qui porte le cookie de session jusqu'à `/authors/me/...` — jamais
 * directement vers `NEXT_PUBLIC_API_URL`, qui ne verrait qu'un visiteur
 * anonyme. Réservé à la lecture (`GET`) : aucune écriture n'a encore besoin
 * de passer par un composant client dans cet espace.
 */
export class AuthorApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthorApiError";
    this.statusCode = statusCode;
  }
}

export async function authorFetch<T>(path: string): Promise<T> {
  const response = await fetch(`/api/author${path}`);

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new AuthorApiError(
      response.status,
      payload.message ?? "Une erreur est survenue. Veuillez réessayer.",
    );
  }

  return (await response.json()) as T;
}
