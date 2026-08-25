"use client";

/**
 * Client HTTP du back-office, côté navigateur.
 *
 * Passe systématiquement par `/api/admin/*`, le relais Next.js qui porte le
 * cookie de session jusqu'à l'API (voir `app/api/admin/[...path]/route.ts`) —
 * jamais directement vers `NEXT_PUBLIC_API_URL`, qui ne verrait qu'un visiteur
 * anonyme.
 */
export class AdminApiError extends Error {
  readonly statusCode: number;
  readonly fieldErrors: Record<string, string[]>;

  constructor(statusCode: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "AdminApiError";
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export interface AdminFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Corps déjà prêt à l'envoi (téléversement) : pas de sérialisation JSON. */
  formData?: FormData;
}

export async function adminFetch<T>(
  path: string,
  options: AdminFetchOptions = {},
): Promise<T> {
  const { method = "GET", body, formData } = options;

  const response = await fetch(`/api/admin${path}`, {
    method,
    headers: formData ? undefined : { "Content-Type": "application/json" },
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    throw new AdminApiError(
      response.status,
      payload.message ?? "Une erreur est survenue. Veuillez réessayer.",
      payload.errors,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
