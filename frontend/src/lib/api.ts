/**
 * Client HTTP de l'API GeBook.
 *
 * Tout appel à NestJS passe par ici. Centraliser l'URL de base, les cookies, le
 * décodage et les erreurs évite de disséminer des `fetch` à demi configurés dans
 * les composants — et garantit qu'aucun appel n'oublie de transmettre la session.
 */

/** Forme normalisée des erreurs renvoyées par le `HttpExceptionFilter` de l'API. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
  path: string;
  timestamp: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  /** Erreurs de validation indexées par champ, à afficher sous le bon libellé. */
  readonly fieldErrors: Record<string, string[]>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.statusCode = body.statusCode;
    this.fieldErrors = body.errors ?? {};
  }

  /** Vrai lorsque la ressource demandée n'existe pas — utile pour un `notFound()`. */
  get isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

export interface ApiRequestOptions {
  /** Paramètres d'URL ; les valeurs vides sont ignorées. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Corps JSON, sérialisé automatiquement. */
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * Durée de mise en cache en secondes côté Next.js. `0` force un rendu frais :
   * c'est ce qu'il faut pour toute donnée propre à l'utilisateur connecté.
   */
  revalidate?: number;
  signal?: AbortSignal;
  /**
   * En-têtes additionnels. Sert au rendu serveur : un Server Component ne partage
   * aucun cookie de navigateur avec `fetch`, contrairement au client — c'est ici que
   * le cookie de session lu par `getCurrentUser()` est retransmis à l'API.
   */
  headers?: Record<string, string>;
}

export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL n'est pas définie : le frontend ne sait pas où joindre l'API.",
    );
  }

  return url.replace(/\/+$/, "");
}

function buildUrl(path: string, query: ApiRequestOptions["query"]): string {
  const url = new URL(`${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, revalidate, signal, headers } = options;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : undefined),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // La session vit dans un cookie `httpOnly` : sans cette option, l'API voit
    // toutes les requêtes comme anonymes.
    credentials: "include",
    signal,
    next: revalidate === undefined ? undefined : { revalidate },
  });

  if (!response.ok) {
    throw new ApiError(await readErrorBody(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const parsed: unknown = await response.json();

    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      return parsed as ApiErrorBody;
    }
  } catch {
    // Une réponse d'erreur peut ne pas être du JSON : passerelle en panne, coupure
    // réseau, page d'erreur d'un proxy. On retombe alors sur un message générique.
  }

  return {
    statusCode: response.status,
    message: "Le service est momentanément indisponible. Veuillez réessayer.",
    path: response.url,
    timestamp: new Date().toISOString(),
  };
}
