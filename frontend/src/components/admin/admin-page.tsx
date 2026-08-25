import type { LucideIcon } from "lucide-react";

import { cn } from "@/src/lib/utils";

/**
 * En-tête d'une page d'administration.
 *
 * Plus dense que celui du site public : pas de sur-titre doré, pas de chapô
 * étalé. Le back-office est un outil, la place doit aller aux données.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-border mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="type-h2 text-secondary">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Panneau de contenu de l'administration.
 *
 * Une carte, pas quinze : le back-office regroupe par bloc fonctionnel plutôt
 * que d'entourer chaque champ.
 */
export function AdminPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-border bg-card rounded-lg border", className)}>
      {title && (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="type-h3 text-secondary">{title}</h2>
            {description && <p className="type-caption mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STAT_GRID_COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

/**
 * Rangée de cartes de synthèse, en tête d'une page de module.
 *
 * `columns` doit correspondre au nombre réel de cartes passées en enfants —
 * il ne s'agit pas d'inventer une carte de plus pour remplir la grille par
 * défaut (4 colonnes), mais de choisir la grille qui correspond au nombre de
 * cartes qu'une page a réellement à montrer.
 */
export function AdminStatGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: keyof typeof STAT_GRID_COLUMNS;
}) {
  return <dl className={cn("mb-6 grid gap-4", STAT_GRID_COLUMNS[columns])}>{children}</dl>;
}

/**
 * Carte de synthèse.
 *
 * Même gabarit que `Metric`/`Amount` du tableau de bord (`admin/page.tsx`),
 * généralisé ici pour que chaque page de module (œuvres, auteurs, commandes…)
 * l'utilise sans dupliquer le balisage.
 */
export function AdminStatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <dt className="type-label text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon aria-hidden className="size-3.5" />}
        {label}
      </dt>
      <dd className="mt-2">
        <span className="font-heading text-secondary tnum block text-2xl font-semibold sm:text-3xl">
          {value}
        </span>
        {hint && <span className="type-caption">{hint}</span>}
      </dd>
    </div>
  );
}

/** Panneau dont le contenu est un tableau : pas de rembourrage interne. */
export function AdminTablePanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="type-h3 text-secondary">{title}</h2>
          {description && <p className="type-caption mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
