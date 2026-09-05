import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/src/lib/api";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/src/lib/tenant-shared";

/**
 * Relais authentifié vers l'API d'administration.
 *
 * Le cookie de session vit sur l'origine du frontend, pas celle de l'API (audit
 * §32, voir `auth-actions.ts`) : un appel `fetch` direct du navigateur vers l'API
 * ne le porterait jamais. Ce relais fait exactement l'inverse du chemin
 * d'authentification — il lit le cookie côté serveur Next.js et le retransmet à
 * l'API — pour que le reste du back-office puisse malgré tout suivre la règle
 * générale : « le frontend appelle l'API », jamais l'inverse.
 *
 * Aucune logique métier ici : validation, autorisation et écriture restent
 * entièrement dans NestJS. Ce fichier ne fait que transporter la requête telle
 * quelle, y compris les téléversements multipart.
 */
async function proxy(request: Request, path: string[]): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  // Sans lui, `TenantAccessGuard` (API) ne voit jamais quel espace est actif :
  // il retomberait systématiquement sur le cas « aucun tenant sélectionné »,
  // qui ne fonctionne que pour un platform_admin (brief §7).
  const activeTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE_NAME)?.value;
  const incomingUrl = new URL(request.url);

  const targetUrl = new URL(`${apiBaseUrl()}/admin/${path.join("/")}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (token) {
    const forwardedCookies = [`${SESSION_COOKIE_NAME}=${token}`];
    if (activeTenantId) {
      forwardedCookies.push(`${ACTIVE_TENANT_COOKIE_NAME}=${activeTenantId}`);
    }
    headers.set("cookie", forwardedCookies.join("; "));
  }
  // Même logique que pour la connexion (`auth-actions.ts`) : l'API vérifie
  // cette origine sur toute méthode d'écriture (`OriginGuard`), il faut la lui
  // fournir explicitement puisque ce relais est un appel serveur à serveur.
  // L'en-tête `Origin` envoyé par le navigateur lui-même est repris tel quel
  // plutôt que reconstruit depuis `request.url` : derrière un proxy inverse
  // qui termine le TLS (Traefik/Dokploy), le schéma/hôte reconstruit par
  // Next.js peut ne pas refléter l'origine publique réelle, ce que
  // `OriginGuard` rejetterait alors à tort. Un navigateur moderne envoie déjà
  // `Origin` sur toute requête d'écriture, même de même origine.
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
  // `AdminWorksController.previewFile` définit cet en-tête pour qu'un PDF
  // s'ouvre dans l'onglet plutôt que d'être proposé au téléchargement — sans
  // le relayer, le nom de fichier et la disposition `inline` se perdaient en
  // route.
  const responseContentDisposition = response.headers.get("content-disposition");
  if (responseContentDisposition) {
    responseHeaders.set("content-disposition", responseContentDisposition);
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, (await context.params).path);
}
