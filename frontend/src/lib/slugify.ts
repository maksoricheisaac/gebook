/**
 * Transforme un libellé en identifiant d'URL.
 *
 * Extrait de `work-list.tsx`, `category-manager.tsx` et `author-manager.tsx`, où
 * la même fonction était recopiée à l'identique — avec le risque qu'une
 * correction n'atteigne qu'une des trois.
 *
 * La normalisation `NFD` sépare les accents de leur lettre pour que la plage
 * `̀-ͯ` puisse les retirer : « Théorie musicale » devient donc bien
 * `theorie-musicale`, et non `th-orie-musicale`.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
