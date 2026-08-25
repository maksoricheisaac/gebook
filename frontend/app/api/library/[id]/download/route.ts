import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/src/lib/api";
import { SESSION_COOKIE_NAME } from "@/src/lib/session-cookie";

/**
 * Relais du téléchargement d'un ouvrage acheté.
 *
 * Contrairement au relais des fichiers publics (`app/api/media`), celui-ci est
 * strictement personnel : le cookie de session vit sur l'origine du frontend,
 * un lien pointant directement vers l'API ne le porterait pas et le lecteur
 * recevrait un 401 en cliquant sur son propre livre.
 *
 * Ce relais ne décide rien : il ne connaît ni la propriété, ni le quota, ni le
 * statut d'accès. Tous les contrôles restent côté API, sur `reader_library`
 * (règle n° 17). Il se contente de transmettre la session et de retransmettre
 * le flux.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  // Les destinations sont construites à partir de l'URL de la requête : aucune
  // variable d'environnement supplémentaire, et l'origine reste toujours juste.
  if (!token) {
    return NextResponse.redirect(
      new URL(`/connexion?retour=${encodeURIComponent("/bibliotheque")}`, request.url),
    );
  }

  const response = await fetch(
    `${apiBaseUrl()}/library/${encodeURIComponent(id)}/download`,
    {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      cache: "no-store",
    },
  );

  // Un refus ne doit pas afficher du JSON brut à quelqu'un qui vient de cliquer
  // sur « Télécharger » : le lecteur revient sur sa bibliothèque, qui explique
  // la situation avec les données à jour.
  if (!response.ok) {
    return NextResponse.redirect(
      new URL(`/bibliotheque?echec=${response.status}`, request.url),
    );
  }

  const headers = new Headers();
  for (const header of ["content-type", "content-disposition", "content-length"]) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  // Un ouvrage acheté ne doit rester ni dans un cache partagé ni sur disque.
  headers.set("cache-control", "private, no-store");

  return new Response(response.body, { status: 200, headers });
}
