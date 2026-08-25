/**
 * Petits utilitaires partagés par les formulaires admin bilingues
 * (`work-editor.tsx`, `author-manager.tsx`, `category-manager.tsx`,
 * `work-list.tsx`).
 *
 * L'API distingue un champ absent (repli vers le français, `?? frValue`) d'un
 * champ présent mais vide (`""`, qui écraserait le repli — voir
 * `catalog.response.ts#resolveWorkFields` côté API). Ces deux fonctions
 * existent pour qu'un champ anglais laissé vide ne parte jamais comme une
 * chaîne vide.
 */

/** Chaîne vide (ou seulement des espaces) -> `undefined`, jamais envoyée à l'API. */
export function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Vrai si au moins un champ de l'objet contient une valeur non vide. */
export function hasAnyValue(fields: Record<string, string | undefined>): boolean {
  return Object.values(fields).some((value) => value?.trim());
}
