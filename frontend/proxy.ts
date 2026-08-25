import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";

/**
 * Vérifie uniquement la présence du cookie de session (audit §32) : c'est un filtre
 * rapide qui évite un aller-retour vers l'API pour un visiteur manifestement anonyme.
 * La vérification qui compte réellement — la session est-elle encore valide, le
 * compte a-t-il le bon rôle — reste faite par la page elle-même via `requireRole()`,
 * qui interroge l'API. Un cookie présent mais périmé n'est donc jamais traité comme
 * un accès légitime : la page le rejettera à son tour.
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/connexion", request.url);
  loginUrl.searchParams.set("retour", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/mon-espace/:path*", "/auteur/:path*", "/admin/:path*"],
};
