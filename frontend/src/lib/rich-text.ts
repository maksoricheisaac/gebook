/**
 * Aide partagée entre l'éditeur riche (`rich-text-editor.tsx`) et son rendu
 * (`rich-text.tsx`) : ce que la base contient n'est pas toujours du HTML.
 *
 * Les biographies, descriptions et résumés existaient avant l'éditeur riche —
 * du texte brut, avec des retours à la ligne manuels, affiché jusqu'ici via
 * `whitespace-pre-line`. Un contenu jamais réédité depuis reste tel quel en
 * base : le charger tel quel dans l'éditeur (qui interprète une chaîne comme
 * du HTML) collapserait ces retours à la ligne. `normalize` détecte ce cas
 * (absence de toute balise) et reconstruit des paragraphes équivalents.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const HAS_TAG = /<[a-z][\s\S]*>/i;

/** Texte brut hérité -> HTML équivalent (un `<p>` par paragraphe, `<br>` pour un simple retour à la ligne). */
function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Normalise une valeur de champ riche : HTML déjà produit par l'éditeur -> inchangé ; texte brut hérité -> converti. */
export function normalizeRichText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return HAS_TAG.test(trimmed) ? trimmed : plainTextToHtml(trimmed);
}

/** Extrait le texte visible d'un champ riche — pour un `<meta>`, un fil d'Ariane ou un sous-titre compact, jamais pour un affichage formaté. */
export function stripRichText(value: string | null | undefined): string {
  const normalized = normalizeRichText(value);
  if (!normalized) return "";
  return normalized
    .replace(/<(p|br|li|h[1-6]|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
