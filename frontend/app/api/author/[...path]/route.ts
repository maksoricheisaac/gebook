import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/src/lib/api";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";

/**
 * Relais authentifié vers l'espace auteur (`/authors/me/...`).
 *
 * Même raison d'être que `app/api/admin/[...path]/route.ts` — un composant
 * client ne porte pas le cookie de session httpOnly jusqu'à l'origine de
 * l'API — mais ciblé sur `/authors/`, pas `/admin/` : le tableau de bord
 * auteur (`/auteur/tableau-de-bord`) vit hors back-office et n'a donc pas
 * accès au relais `/api/admin/*`, dont l'usage est explicitement réservé au
 * back-office (voir `QueryProvider`). Lecture seule pour l'instant (`GET`) :
 * rien sous `/authors/me` n'est encore écrit depuis un composant client.
 */
async function proxy(request: Request, path: string[]): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const incomingUrl = new URL(request.url);

  const targetUrl = new URL(`${apiBaseUrl()}/authors/${path.join("/")}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  if (token) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
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

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
