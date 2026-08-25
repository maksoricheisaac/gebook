import { AlertTriangle, BookOpen, type LucideIcon } from "lucide-react";

import { cn } from "@/src/lib/utils";

/*
 * Les quatre états qu'une page peut afficher à la place de son contenu.
 *
 * Rassemblés dans un seul fichier parce qu'ils partagent la même mise en page :
 * une zone encadrée d'un filet discontinu, une icône, un titre, une explication,
 * et — le point qui manquait partout — une action pour s'en sortir.
 */

function StateFrame({
  icon: Icon,
  tone = "neutral",
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "danger";
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center",
        tone === "danger"
          ? "border-destructive/30 bg-destructive-muted/40"
          : "border-border-strong bg-card",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-8", tone === "danger" ? "text-destructive" : "text-ink-300")}
      />
      <h3 className="type-h3 text-secondary">{title}</h3>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm text-pretty">
          {description}
        </p>
      )}
      {children && (
        <div className="mt-2 flex flex-wrap justify-center gap-3">{children}</div>
      )}
    </div>
  );
}

/** Rien à afficher, mais tout fonctionne. Doit toujours proposer une suite. */
export function EmptyState({
  title,
  description,
  icon = BookOpen,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateFrame icon={icon} title={title} description={description} className={className}>
      {children}
    </StateFrame>
  );
}

/** Quelque chose a échoué. Doit toujours proposer une reprise. */
export function ErrorState({
  title = "Le contenu n’a pas pu être chargé",
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateFrame
      icon={AlertTriangle}
      tone="danger"
      title={title}
      description={description}
      className={className}
    >
      {children}
    </StateFrame>
  );
}

/**
 * Bloc de chargement.
 *
 * Une forme grise animée, dimensionnée comme le contenu qu'elle remplace : la
 * place est réservée avant l'arrivée des données, donc rien ne saute quand elles
 * arrivent (CLS). L'animation est purement décorative et disparaît sous
 * `prefers-reduced-motion`, géré globalement dans `globals.css`.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("bg-paper-200 animate-pulse rounded-md", className)} />
  );
}

/**
 * Gabarit d'attente d'une grille de livres.
 *
 * Le conteneur porte `aria-busy` et un texte masqué : un lecteur d'écran entend
 * « Chargement des livres » plutôt que rien du tout.
 */
export function BookGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4"
    >
      <span className="sr-only">Chargement des livres…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Skeleton className="aspect-2/3 w-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Échec de chargement à l'intérieur d'un panneau de tableau.
 *
 * Une erreur doit toujours proposer une reprise : les listes du back-office
 * affichaient auparavant un tableau vide, impossible à distinguer d'une absence
 * réelle de données.
 */
export function RetryRow({
  onRetry,
  label,
}: {
  onRetry: () => void;
  /** Ce qui n'a pas pu être chargé, au pluriel : « commandes », « auteurs »… */
  label: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-muted-foreground text-sm">
        Les {label} n’ont pas pu être chargées.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary mt-2 cursor-pointer text-sm font-semibold hover:underline"
      >
        Réessayer
      </button>
    </div>
  );
}

/** Gabarit d'attente d'un tableau d'administration. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div aria-busy="true" className="divide-border divide-y">
      <span className="sr-only">Chargement des données…</span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn("h-4", column === 0 ? "w-40" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
