/**
 * URL d'un fichier public stocké par l'API (couvertures, photos d'auteur).
 *
 * Le chemin renvoyé est **relatif au frontend**, et non l'URL directe de l'API.
 * Il passe par le relais `app/api/media/[...path]`, qui existe pour une raison
 * précise, détaillée dans ce fichier de route : servie depuis l'origine de
 * l'API, l'image est bloquée par son en-tête `Cross-Origin-Resource-Policy`.
 *
 * Effet secondaire bienvenu : une URL relative est une image « locale » pour
 * `next/image`, donc réellement optimisable, contrairement à une source distante
 * qu'il faut déclarer dans `remotePatterns`.
 */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  // Les chemins arrivent de la base sous la forme `covers/mon-livre.svg`. Chaque
  // segment est encodé séparément pour qu'un nom de fichier accentué survive au
  // trajet sans que les `/` de structure ne soient échappés.
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent);

  return `/api/media/${segments.join("/")}`;
}
