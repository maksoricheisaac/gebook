import Link from "next/link";
import type { Metadata } from "next";
import { Info } from "lucide-react";

import { AccountShell } from "@/src/components/account/account-shell";
import { TenantSwitcher } from "@/src/components/layout/tenant-switcher";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { requireRole } from "@/src/lib/auth";
import {
  fetchAuthorRevenue,
  fetchAuthorSales,
  PAYOUT_STATUS_LABELS,
  type AuthorSale,
} from "@/src/lib/commissions";
import { formatDate, formatPrice } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace auteur",
  robots: { index: false, follow: false },
};

/**
 * Espace auteur.
 *
 * Chaque montant affiché ici est un instantané figé au moment de la vente, pas
 * une estimation recalculée à l'affichage : c'est ce qui permet à un auteur de
 * retrouver exactement la même somme d'un mois sur l'autre, même si le taux de
 * commission a changé entre-temps (règle n° 13).
 */
export default async function AuthorDashboardPage(
  props: PageProps<"/auteur/tableau-de-bord">,
) {
  const user = await requireRole(["author", "admin"], "/auteur/tableau-de-bord");
  const revenue = await fetchAuthorRevenue();

  if (!revenue) {
    return (
      <AccountShell
        user={user}
        title={`Bonjour, ${user.firstName}.`}
        description="Votre espace auteur."
      >
        <EmptyState
          icon={Info}
          title="Aucune fiche d’auteur n’est rattachée à votre compte"
          description="Vos ventes et vos revenus apparaîtront ici dès qu’un administrateur aura relié votre compte à votre fiche d’auteur."
        >
          <Button asChild variant="outline">
            <Link href="/contact">Contacter l’équipe</Link>
          </Button>
        </EmptyState>
      </AccountShell>
    );
  }

  const searchParams = await props.searchParams;
  const pageParam = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const page = Math.max(1, Number(pageParam) || 1);
  const sales = await fetchAuthorSales(page);

  return (
    <AccountShell
      user={user}
      title={`Bonjour, ${user.firstName}.`}
      description="Vos ventes et les montants qui vous reviennent, figés au moment de chaque commande."
      actions={
        <div className="flex flex-wrap items-end gap-4">
          <TenantSwitcher />
          <Button asChild variant="outline">
            <Link href="/livres">Voir le catalogue</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-10">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Ventes" value={String(revenue.salesCount)} />
          <Metric label="Chiffre d’affaires" value={formatPrice(revenue.grossTotal)} />
          <Metric
            label="Commission GeBook"
            value={formatPrice(revenue.commissionTotal)}
          />
          <Metric
            label="Vous revient"
            value={formatPrice(revenue.netTotal)}
            hint={`dont ${formatPrice(revenue.pendingPayout)} à verser`}
            emphasis
          />
        </dl>

        <section>
          <h2 className="type-h3 text-secondary mb-4">Détail des ventes</h2>

          {sales.data.length === 0 ? (
            <EmptyState
              title="Aucune vente pour le moment"
              description="Chaque commande réglée apparaîtra ici avec le détail de sa répartition."
            />
          ) : (
            <ul className="space-y-3">
              {sales.data.map((sale) => (
                <li key={sale.id}>
                  <SaleCard sale={sale} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {sales.meta.totalPages > 1 && (
          <nav className="flex justify-center gap-3" aria-label="Pagination des ventes">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/auteur/tableau-de-bord?page=${page - 1}`}>Précédent</Link>
              </Button>
            )}
            {page < sales.meta.totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/auteur/tableau-de-bord?page=${page + 1}`}>Suivant</Link>
              </Button>
            )}
          </nav>
        )}
      </div>
    </AccountShell>
  );
}

/**
 * Fiche d'une vente.
 *
 * Elle montre la décomposition complète — brut, frais, commission, part auteur —
 * plutôt qu'un seul montant net. Un auteur doit pouvoir vérifier lui-même d'où
 * vient sa rémunération, sans avoir à demander.
 */
function SaleCard({ sale }: { sale: AuthorSale }) {
  return (
    <article className="border-border bg-card rounded-lg border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-secondary leading-snug font-semibold">{sale.workTitle}</h3>
          <p className="type-caption">
            {sale.orderNumber} · {formatDate(sale.soldAt)}
            {sale.quantity > 1 && ` · ×${sale.quantity}`}
          </p>
        </div>
        <Badge variant="neutral">
          {PAYOUT_STATUS_LABELS[sale.payoutStatus] ?? sale.payoutStatus}
        </Badge>
      </div>

      <dl className="border-border mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm sm:grid-cols-4">
        <Line label="Vente" value={formatPrice(sale.grossAmount)} />
        <Line label="Frais prestataire" value={`− ${formatPrice(sale.providerFee)}`} />
        <Line
          label="Commission"
          value={`− ${formatPrice(sale.gebookCommissionAmount)}`}
        />
        <Line label="Vous revient" value={formatPrice(sale.authorNetAmount)} strong />
      </dl>
    </article>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd
        className={
          strong ? "text-secondary tnum font-semibold" : "text-muted-foreground tnum"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "border-accent/40 bg-card rounded-lg border p-5"
          : "border-border bg-card rounded-lg border p-5"
      }
    >
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <span className="font-heading text-secondary tnum block text-2xl font-semibold">
          {value}
        </span>
        {hint && <span className="type-caption">{hint}</span>}
      </dd>
    </div>
  );
}
