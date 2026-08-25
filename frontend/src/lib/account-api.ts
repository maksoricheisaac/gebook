"use client";

/**
 * Client HTTP des routes de compte, côté navigateur.
 *
 * Même forme qu'`admin-api.ts`, mais passe par `/api/account/*` — le relais
 * vers `AuthController` (`/auth/me`, `/auth/me/password`), qui n'est pas
 * scopé au back-office.
 */
export class AccountApiError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "AccountApiError";
    this.fieldErrors = fieldErrors;
  }
}

export interface AccountFetchOptions {
  method?: "PATCH" | "POST";
  body?: unknown;
}

export async function accountFetch<T>(
  path: string,
  options: AccountFetchOptions = {},
): Promise<T> {
  const { method = "PATCH", body } = options;

  const response = await fetch(`/api/account${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    throw new AccountApiError(
      payload.message ?? "Une erreur est survenue. Veuillez réessayer.",
      payload.errors,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
