import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/src/lib/api";

/**
 * Relais des fichiers publics de l'API (couvertures, photos d'auteur).
 *
 * Il corrige un défaut qui rendait TOUTES les couvertures invisibles dans le
 * navigateur, sans qu'aucune erreur ne remonte côté serveur.
 *
 * Enchaînement du problème :
 *   1. l'API sert `/public/*` avec `Cross-Origin-Resource-Policy: same-origin`,
 *      ce qui est le bon réglage de sécurité par défaut ;
 *   2. les couvertures du catalogue sont des SVG, et `next/image` refuse
 *      d'optimiser un SVG sans `dangerouslyAllowSVG` — il laisse donc passer
 *      l'URL d'origine telle quelle ;
 *   3. le navigateur va alors chercher l'image directement sur `:3001` depuis
 *      une page de `:3000`, et l'en-tête CORP la bloque
 *      (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`).
 *
 * Passer par ce relais rend l'image **de première partie** : le téléchargement
 * a lieu de serveur à serveur, la politique CORP de l'API n'a plus à être
 * assouplie, et les images matricielles téléversées plus tard resteront
 * optimisables par `next/image` puisque leur URL devient relative.
 *
 * Aucune autorisation ici, volontairement : ces fichiers sont publics par
 * définition. Les livres achetés, eux, ne passeront jamais par ce chemin — ils
 * relèveront d'un téléchargement contrôlé côté API.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;

  // Défense élémentaire contre la remontée d'arborescence : aucun segment ne
  // doit pouvoir sortir de `/public` sur le disque de l'API.
  if (path.some((segment) => segment === ".." || segment.includes("\\"))) {
    return new NextResponse(null, { status: 400 });
  }

  const target = `${apiBaseUrl()}/public/${path.map(encodeURIComponent).join("/")}`;

  const response = await fetch(target, {
    // Les couvertures changent rarement, et une couverture périmée d'une heure
    // n'a aucune conséquence.
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const headers = new Headers();
  headers.set(
    "content-type",
    response.headers.get("content-type") ?? "application/octet-stream",
  );
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  // Le SVG est un format exécutable : servi en pièce jointe interdite de script,
  // il ne peut pas devenir un vecteur d'injection sur notre propre origine.
  headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
  headers.set("x-content-type-options", "nosniff");

  return new NextResponse(response.body, { status: 200, headers });
}
