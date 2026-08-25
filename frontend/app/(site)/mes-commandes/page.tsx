import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { AccountShell } from "@/src/components/account/account-shell";
import { Pagination } from "@/src/components/catalog/pagination";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { requireUser } from "@/src/lib/auth";
import { formatDateTime, formatPrice } from "@/src/lib/format";
import { isPayable, OrderStatusBadge } from "@/src/lib/order-status";
import { fetchMyOrders, type Order } from "@/src/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes commandes",
  robots: { index: false, follow: false },
};

/**
 * Historique des commandes.
 *
 * Passé du tableau à la liste de fiches. Un tableau suppose qu'on compare des
 * lignes colonne par colonne ; ici on cherche UNE commande et son état. La fiche
 * met donc le numéro, le contenu et l'action au même endroit, et reste lisible
 * sur un téléphone — là où le tableau exigeait un défilement horizontal.
 */
export default async function MyOrdersPage(props: PageProps<"/mes-commandes">) {
  const user = await requireUser("/mes-commandes");

  const searchParams = await props.searchParams;
  const pageParam = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const page = Math.max(1, Number(pageParam) || 1);

  const orders = await fetchMyOrders(page);

  return (
    <AccountShell
      user={user}
      title="Mes commandes"
      description={
        orders.meta.total > 0
          ? `${orders.meta.total} ${orders.meta.total > 1 ? "commandes" : "commande"} depuis la création de votre compte.`
          : undefined
      }
      actions={
        <Button asChild variant="outline">
          <Link href="/livres">Commander un ouvrage</Link>
        </Button>
      }
    >
      {orders.data.length === 0 ? (
        <EmptyState
          title="Aucune commande pour le moment"
          description="Dès que vous passerez une commande, elle apparaîtra ici avec son numéro, son contenu et son statut."
        >
          <Button asChild>
            <Link href="/livres">Parcourir le catalogue</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {orders.data.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={orders.meta.page}
        totalPages={orders.meta.totalPages}
        buildHref={(targetPage) =>
          targetPage > 1 ? `/mes-commandes?page=${targetPage}` : "/mes-commandes"
        }
      />
    </AccountShell>
  );
}

/**
 * Fiche d'une commande.
 *
 * L'appel à l'action change de nature selon l'état : « Régler » quand un
 * paiement est encore attendu, « Voir le détail » sinon. La version précédente
 * affichait un lien de même poids dans les deux cas, ce qui n'aidait pas à
 * distinguer ce qui demandait une action de ce qui n'en demandait plus.
 */
function OrderCard({ order }: { order: Order }) {
  const payable = isPayable(order.status);
  const itemCount = order.items.length;

  return (
    <article className="border-border bg-card rounded-lg border">
      <div className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-secondary text-sm font-semibold">{order.orderNumber}</h2>
          <span aria-hidden className="text-ink-300 hidden sm:inline">
            ·
          </span>
          <p className="type-meta">{formatDateTime(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="flex flex-col gap-5 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <ul className="space-y-1.5">
            {order.items.slice(0, 3).map((item) => (
              <li key={item.id} className="text-[0.9375rem] leading-snug">
                <span className="text-secondary font-medium">{item.workTitle}</span>
                <span className="type-caption block">
                  {item.authorName} · {item.formatType.toUpperCase()}
                  {item.quantity > 1 && ` · ×${item.quantity}`}
                </span>
              </li>
            ))}
          </ul>
          {itemCount > 3 && (
            <p className="type-caption mt-2">
              et {itemCount - 3} autre{itemCount - 3 > 1 ? "s" : ""} article
              {itemCount - 3 > 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <p className="text-secondary tnum text-lg font-semibold">
            {formatPrice(order.totalAmount)}
          </p>
          <Button asChild variant={payable ? "default" : "outline"} size="sm">
            <Link href={`/paiement/${order.orderNumber}`}>
              {payable ? "Régler la commande" : "Voir le détail"}
              <ArrowRight aria-hidden />
              <span className="sr-only"> — commande {order.orderNumber}</span>
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
