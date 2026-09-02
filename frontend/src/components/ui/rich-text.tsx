import sanitizeHtml from "sanitize-html";

import { cn } from "@/src/lib/utils";
import { normalizeRichText } from "@/src/lib/rich-text";

/**
 * Même liste blanche que `backend/src/common/rich-text.ts` — à garder en
 * phase avec elle. Le backend a déjà nettoyé ce contenu à l'écriture ; ce
 * second passage est une défense en profondeur (marketplace en
 * auto-publication : mieux vaut deux filtres redondants qu'un seul qui suffit
 * presque toujours).
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "span",
];

const ALLOWED_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/;

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"], span: ["style"] },
    allowedStyles: { span: { color: [ALLOWED_COLOR] } },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}

/**
 * Rend un champ de texte riche (biographie, description, présentation…).
 * Compatible composant serveur — pas de `"use client"` ici, juste du HTML
 * assaini injecté directement, comme tout autre rendu de composant serveur.
 */
export function RichText({
  html,
  className,
  as: Tag = "div",
}: {
  html: string | null | undefined;
  className?: string;
  as?: "div" | "section";
}) {
  const normalized = normalizeRichText(html);
  if (!normalized) return null;

  return (
    <Tag
      className={cn("prose-editorial", className)}
      dangerouslySetInnerHTML={{ __html: sanitize(normalized) }}
    />
  );
}
