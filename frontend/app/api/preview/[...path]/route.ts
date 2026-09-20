import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/src/lib/api";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";

/**
 * Relais de la Book Preview Sandbox.
 *
 * Contrairement à `app/api/library/[id]/download` : cette route est publique
 * — un visiteur non connecté doit pouvoir l'appeler, pas de redirection vers
 * la connexion ici. Le cookie de session est transmis QUAND il existe, pour
 * que le backend distingue visiteur/lecteur/auteur/admin (`OptionalAuthGuard`)
 * — c'est toujours le backend qui décide de ce qui est renvoyé, ce relais ne
 * fait que porter la session le cas échéant.
 *
 * Sert aussi bien la réponse JSON (`/preview/:slug`) que l'image de chaque
 * page (`/preview/:slug/pages/:page`) : un seul relais, le chemin est
 * transmis tel quel.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;

  // Une page d'aperçu ne se télécharge pas : elle n'est servie que comme image
  // intégrée à la page du site (`<img>`). Ouvrir directement son adresse dans
  // un onglet, ou l'intégrer depuis un autre site, est refusé — les
  // navigateurs indiquent cette destination dans `Sec-Fetch-*`.
  const isPage = path.includes("pages");
  if (isPage) {
    const dest = request.headers.get("sec-fetch-dest");
    const site = request.headers.get("sec-fetch-site");
    if (
      (dest !== null && dest !== "image") ||
      (site !== null && site !== "same-origin")
    ) {
      return new NextResponse("Non disponible au téléchargement.", { status: 403 });
    }
  }
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  const response = await fetch(
    `${apiBaseUrl()}/preview/${path.map(encodeURIComponent).join("/")}`,
    {
      headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const headers = new Headers();
  for (const header of ["content-type", "content-disposition", "content-length"]) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", "inline");

  return new Response(response.body, { status: 200, headers });
}
