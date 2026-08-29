import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/src/lib/api";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";

/**
 * Relais authentifié vers les routes de compte (`/auth/me`, `/auth/me/password`).
 *
 * Même raison d'être que `app/api/admin/[...path]/route.ts` — un composant
 * client ne porte pas le cookie de session httpOnly jusqu'à l'origine de
 * l'API — mais ciblé sur `/auth/`, pas `/admin/` : la modification du profil
 * et le changement de mot de passe concernent n'importe quel compte
 * authentifié, pas seulement le back-office (`AuthController`, pas un
 * contrôleur admin).
 */
async function proxy(request: Request, path: string[]): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const incomingUrl = new URL(request.url);

  const targetUrl = new URL(`${apiBaseUrl()}/auth/${path.join("/")}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (token) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  }
  // Voir `app/api/admin/[...path]/route.ts` pour le raisonnement complet :
  // l'en-tête `Origin` envoyé par le navigateur est repris tel quel plutôt que
  // reconstruit depuis `request.url`, fragile derrière un proxy inverse
  // terminant le TLS (Traefik/Dokploy).
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin) {
    headers.set("origin", browserOrigin);
  } else {
    headers.set("origin", incomingUrl.origin);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) {
    responseHeaders.set("content-type", responseContentType);
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
