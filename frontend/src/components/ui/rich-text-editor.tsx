"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Eraser,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Palette,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";

import { cn } from "@/src/lib/utils";
import { normalizeRichText } from "@/src/lib/rich-text";

/**
 * Nuancier de marque — les mêmes teintes que `app/globals.css` (`--ink-700`,
 * `--leaf-700`, `--gold-500`, `--clay-600`), pas un sélecteur de couleur
 * libre : un texte éditorial reste sobre, et cinq teintes cohérentes suffisent
 * à ce que « couleurs » demandait sans ouvrir la porte à n'importe quoi.
 */
const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Encre", value: "#04182f" },
  { label: "Marine", value: "#07315f" },
  { label: "Feuille", value: "#05603a" },
  { label: "Or", value: "#d99b12" },
  { label: "Terre cuite", value: "#a8321f" },
];

const EDITOR_CONTENT_CLASS = cn(
  "min-h-28 px-3.5 py-2.5 text-base leading-relaxed outline-none md:text-sm",
  "[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0",
  "[&_h2]:font-heading [&_h2]:text-secondary [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:font-semibold first:[&_h2]:mt-0",
  "[&_h3]:font-heading [&_h3]:text-secondary [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold first:[&_h3]:mt-0",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_blockquote]:border-border-strong [&_blockquote]:text-muted-foreground [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
);

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const lastEmitted = React.useRef<string>("");

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: normalizeRichText(value),
    editorProps: {
      attributes: { class: EDITOR_CONTENT_CLASS },
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // Synchronise une valeur qui change de l'extérieur (reset de formulaire,
  // chargement des données) sans toucher au contenu pendant que l'utilisateur
  // tape : `lastEmitted` ne contient que ce que *nous* avons émis en dernier —
  // si `value` diverge de cette référence, le changement vient d'ailleurs.
  React.useEffect(() => {
    if (!editor) return;
    const incoming = normalizeRichText(value);
    if (incoming !== lastEmitted.current && incoming !== editor.getHTML()) {
      lastEmitted.current = incoming;
      editor.commands.setContent(incoming);
    }
  }, [editor, value]);

  // `Field` (voir `field.tsx`) attend que ces attributs vivent sur l'élément de
  // saisie réel — ici la zone éditable (`.ProseMirror`) — pour que le libellé
  // s'y associe et qu'un lecteur d'écran annonce l'erreur. `setOptions` passe
  // par l'API de l'éditeur plutôt qu'une mutation directe du DOM récupéré via
  // `editor.view.dom` (interdite ici par le compilateur React).
  React.useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: EDITOR_CONTENT_CLASS,
          ...(id && { id }),
          ...(ariaInvalid && { "aria-invalid": "true" }),
          ...(ariaDescribedBy && { "aria-describedby": ariaDescribedBy }),
        },
      },
    });
  }, [editor, id, ariaInvalid, ariaDescribedBy]);

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "border-input bg-card rounded-md border",
        "transition-[border-color,box-shadow] duration-[--duration-fast] ease-[--ease-out]",
        "focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-[3px]",
        ariaInvalid && "border-destructive ring-destructive/20 ring-[3px]",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const setLink = React.useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) {
    return <div className="border-border h-11 border-b" aria-hidden />;
  }

  return (
    // `onMouseDown` avec `preventDefault` : sans ça, cliquer un bouton de la
    // barre d'outils déclenche d'abord un `blur` sur la zone éditable — la
    // sélection y est perdue avant même que `onClick` (et son `.focus()`)
    // s'exécute, et la mise en forme s'applique au mauvais endroit, voire à
    // du texte qui n'a pas fini d'arriver.
    <div
      className="border-border flex flex-wrap items-center gap-0.5 border-b p-1.5"
      onMouseDown={(event) => event.preventDefault()}
    >
      <ToolbarButton
        label="Gras"
        icon={Bold}
        isActive={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italique"
        icon={Italic}
        isActive={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Souligné"
        icon={UnderlineIcon}
        isActive={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="Barré"
        icon={Strikethrough}
        isActive={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Titre"
        icon={Heading2}
        isActive={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Sous-titre"
        icon={Heading3}
        isActive={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Liste à puces"
        icon={List}
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Liste numérotée"
        icon={ListOrdered}
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Citation"
        icon={Quote}
        isActive={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Insérer un lien"
        icon={Link2}
        isActive={editor.isActive("link")}
        onClick={setLink}
      />
      <ToolbarButton
        label="Retirer le lien"
        icon={Link2Off}
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive("link")}
      />

      <ToolbarDivider />

      <div
        className="flex items-center gap-1 px-1"
        role="group"
        aria-label="Couleur du texte"
      >
        <Palette aria-hidden className="text-muted-foreground size-3.5" />
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            aria-label={`Texte en ${swatch.label.toLowerCase()}`}
            aria-pressed={editor.isActive("textStyle", { color: swatch.value })}
            onClick={() => editor.chain().focus().setColor(swatch.value).run()}
            className={cn(
              "ring-border size-5 shrink-0 cursor-pointer rounded-full ring-1 ring-inset",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              editor.isActive("textStyle", { color: swatch.value }) &&
                "ring-2 ring-offset-1",
            )}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
      </div>

      <ToolbarButton
        label="Tout effacer la mise en forme"
        icon={Eraser}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      />
    </div>
  );
}

function ToolbarDivider() {
  return <div aria-hidden className="bg-border mx-1 h-5 w-px shrink-0" />;
}

function ToolbarButton({
  label,
  icon: Icon,
  isActive,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm",
        "hover:bg-muted hover:text-secondary transition-colors duration-[--duration-fast]",
        "focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        isActive && "bg-primary/10 text-primary",
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
