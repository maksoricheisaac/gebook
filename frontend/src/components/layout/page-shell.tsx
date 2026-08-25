import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/src/lib/utils";

/*
 * Gabarits de page.
 *
 * Les dix pages du site répétaient chacune leur propre `mx-auto max-w-7xl px-6
 * py-10`, leur propre sur-titre vert en capitales et leur propre `h1`. D'où les
 * gouttières qui variaient d'une page à l'autre et une hiérarchie identique
 * partout, du catalogue à la fiche de commande.
 *
 * Ces trois composants fixent la grille et le rythme une bonne fois.
 */

/** Conteneur de page : largeur maximale et gouttières, identiques partout. */
export function Container({
  children,
  size = "default",
  className,
}: {
  children: React.ReactNode;
  /** `narrow` pour le texte long et les formulaires, `wide` pour les grilles. */
  size?: "narrow" | "default" | "wide";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-6xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * En-tête de page : sur-titre, titre, chapô, actions.
 *
 * Le sur-titre est le seul usage systématique de l'or (le filet de `.rule-accent`),
 * ce qui donne à toutes les pages la même signature éditoriale sans répéter un
 * bandeau coloré.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pt-10 pb-8 sm:pt-14 sm:pb-10", className)}>
      {breadcrumb}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="type-label rule-accent text-muted-foreground">{eyebrow}</p>
          )}
          <h1 className="type-h1 text-secondary">{title}</h1>
          {description && <p className="type-subtitle mt-3">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * En-tête de section, avec son lien « voir tout » optionnel.
 *
 * `as` permet de garder une hiérarchie de titres correcte : une section imbriquée
 * dans une autre doit descendre en `h3`, jamais rester en `h2` pour l'esthétique.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-xl">
        {eyebrow && (
          <p className="type-label rule-accent text-muted-foreground">{eyebrow}</p>
        )}
        <Tag className="type-h2 text-secondary">{title}</Tag>
        {description && (
          <p className="text-muted-foreground mt-2 text-[0.9375rem] text-pretty">
            {description}
          </p>
        )}
      </div>

      {href && linkLabel && (
        <Link
          href={href}
          className="text-primary group inline-flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline"
        >
          {linkLabel}
          <ChevronRight
            aria-hidden
            className="size-4 transition-transform duration-[--duration-fast] group-hover:translate-x-0.5"
          />
        </Link>
      )}
    </div>
  );
}

/** Fil d'Ariane. Requis dès qu'une page est à trois niveaux de profondeur. */
export function Breadcrumb({
  items,
}: {
  /** Le dernier élément est la page courante et n'a pas de lien. */
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-6">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-secondary font-medium">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight aria-hidden className="text-ink-300 size-3.5 shrink-0" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
