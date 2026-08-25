import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { Breadcrumb, Container } from "@/src/components/layout/page-shell";
import { PaymentPanel } from "@/src/components/payment/payment-panel";
import { DataRow, DataTable } from "@/src/components/ui/data-table";
import { ApiError } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { formatDateTime, formatPrice, formatTypeLabel } from "@/src/lib/format";
import { OrderStatusBadge } from "@/src/lib/order-status";
import { fetchOrder, type Order } from "@/src/lib/orders";
import { fetchOrderPayments } from "@/src/lib/payments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votre commande",
  robots: { index: false, follow: false },
};

async function loadOrder(orderNumber: string): Promise<Order> {
  try {
    return await fetchOrder(orderNumber);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      notFound();
    }
    throw error;
  }
}

/**
 * Récapitulatif et règlement d'une commande.
 *
 * Le récapitulatif est à gauche, le règlement à droite et collant : sur une
 * commande à plusieurs articles, le bouton de paiement ne doit pas partir hors
 * de l'écran dès qu'on relit le détail.
 *
 * Aucune coche verte de « commande confirmée » en tête de page, contrairement à
 * la version précédente : elle s'affichait quel que soit le statut, y compris
 * sur une commande en attente ou échouée, et laissait croire que tout était
 * réglé.
 */
export default async function OrderConfirmationPage(
  props: PageProps<"/paiement/[orderNumber]">,
) {
  const { orderNumber } = await props.params;
  await requireUser(`/paiement/${orderNumber}`);

  const order = await loadOrder(orderNumber);
  const payments = await fetchOrderPayments(order.orderNumber);

  const hasDeliveryDetails = Boolean(order.recipientName);

  return (
    <Container size="wide" className="pb-20">
      <div className="pt-8">
        <Breadcrumb
          items={[
            { href: "/mon-espace", label: "Mon espace" },
            { href: "/mes-commandes", label: "Mes commandes" },
            { label: order.orderNumber },
          ]}
        />
      </div>

      <header className="border-border flex flex-wrap items-end justify-between gap-4 border-b pb-8">
        <div>
          <p className="type-label rule-accent text-muted-foreground">Commande</p>
          <h1 className="type-h1 text-secondary tnum">{order.orderNumber}</h1>
          <p className="type-meta mt-2">Passée le {formatDateTime(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14">
        <div className="min-w-0 space-y-10">
          <section>
            <h2 className="type-h3 text-secondary mb-4">Articles commandés</h2>
            <DataTable
              caption={`Articles de la commande ${order.orderNumber}`}
              head={
                <>
                  <th scope="col">Œuvre</th>
                  <th scope="col">Format</th>
                  <th scope="col" className="text-right!">
                    Prix
                  </th>
                  <th scope="col" className="text-right!">
                    Qté
                  </th>
                  <th scope="col" className="text-right!">
                    Total
                  </th>
                </>
              }
            >
              {order.items.map((item) => (
                <DataRow key={item.id}>
                  <td>
                    <p className="text-secondary font-medium">{item.workTitle}</p>
                    <p className="type-caption">{item.authorName}</p>
                  </td>
                  <td className="text-muted-foreground">
                    {formatTypeLabel(item.formatType)}
                  </td>
                  <td className="text-muted-foreground tnum text-right">
                    {formatPrice(item.unitPrice)}
                  </td>
                  <td className="text-muted-foreground tnum text-right">
                    {item.quantity}
                  </td>
                  <td className="text-secondary tnum text-right font-semibold">
                    {formatPrice(item.lineTotal)}
                  </td>
                </DataRow>
              ))}
            </DataTable>

            <div className="mt-5 flex justify-end">
              <dl className="w-full max-w-xs space-y-2 text-sm">
                <Line label="Sous-total" value={formatPrice(order.subtotal)} />
                {Number(order.deliveryFee) > 0 && (
                  <Line label="Livraison" value={formatPrice(order.deliveryFee)} />
                )}
                {Number(order.discountAmount) > 0 && (
                  <Line label="Remise" value={`−${formatPrice(order.discountAmount)}`} />
                )}
                <div className="border-border flex items-baseline justify-between border-t pt-2.5">
                  <dt className="text-secondary font-semibold">Total</dt>
                  <dd className="text-secondary tnum text-lg font-semibold">
                    {formatPrice(order.totalAmount)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {hasDeliveryDetails && (
            <section>
              <h2 className="type-h3 text-secondary mb-4">Remise de la commande</h2>
              <div className="border-border bg-card flex items-start gap-3.5 rounded-lg border p-5">
                <MapPin aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
                <address className="space-y-1 text-sm not-italic">
                  <p className="text-secondary font-medium">{order.recipientName}</p>
                  {order.deliveryPhone && (
                    <p className="text-muted-foreground">{order.deliveryPhone}</p>
                  )}
                  {(order.deliveryAddress ??
                    order.deliveryCity ??
                    order.deliveryCountry) && (
                    <p className="text-muted-foreground">
                      {[
                        order.deliveryAddress,
                        order.deliveryDistrict,
                        order.deliveryCity,
                        order.deliveryCountry,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {order.deliveryLandmark && (
                    <p className="type-caption">Repère : {order.deliveryLandmark}</p>
                  )}
                </address>
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PaymentPanel
            orderNumber={order.orderNumber}
            orderStatus={order.status}
            totalAmount={order.totalAmount}
            paidAt={order.paidAt}
            payments={payments}
          />
        </aside>
      </div>
    </Container>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-muted-foreground flex items-baseline justify-between">
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
