import sanitizeHtml from 'sanitize-html';

/**
 * Balises et attributs produits par l'éditeur riche du front (Tiptap :
 * StarterKit restreint + Underline + Link + Color/TextStyle — voir
 * `frontend/src/components/ui/rich-text-editor.tsx`). Toute balise ou
 * attribut hors de cette liste est retiré, jamais échappé en texte : un
 * contenu qui ne correspond pas à ce que l'éditeur peut produire est traité
 * comme non fiable (marketplace en auto-publication, §audit sécurité).
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  's',
  'u',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'span',
];

const ALLOWED_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'target', 'rel'], span: ['style'] },
  allowedStyles: { span: { color: [ALLOWED_COLOR] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Un lien ajouté par un auteur reste un lien externe : jamais de `target`
  // ouvert sans `rel`, faille bien connue (reverse tabnabbing).
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
    }),
  },
  exclusiveFilter: (frame) =>
    (frame.tag === 'p' || frame.tag === 'li') &&
    !frame.text.trim() &&
    frame.mediaChildren.length === 0,
};

/**
 * Nettoie un champ de texte riche avant écriture (biographie, description,
 * présentation…) : liste blanche de balises, `javascript:`/`data:` impossibles
 * dans un `href`, et tout contenu qui ne serait plus que des balises vides
 * (éditeur ouvert puis laissé vide) redevient `undefined` — comme un champ
 * texte simple jamais rempli, pas comme une chaîne « vide » qui écraserait un
 * repli existant (voir `emptyToUndefined` côté front, même logique).
 */
export function sanitizeRichText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const clean = sanitizeHtml(value, SANITIZE_OPTIONS).trim();
  const textOnly = clean.replace(/<[^>]*>/g, '').trim();
  return textOnly ? clean : undefined;
}
