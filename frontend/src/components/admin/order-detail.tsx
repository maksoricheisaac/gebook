"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader, AdminPanel } from "@/src/components/admin/admin-page";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { FormError } from "@/src/components/ui/field";
import { Select } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { formatDateTime, formatPrice } from "@/src/lib/format";
import { orderStatusLabel } from "@/src/lib/order-status-labels";
import { allowedTransitions, OrderStatusBadge } from "@/src/lib/order-status";

interface OrderItem {
  id: string;
  workId: string;
  workTitle: string;
  authorName: string;
  formatType: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  deliveryFee: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  recipientName: string | null;
  deliveryPhone: string | null;
  deliveryCountry: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryAddress: string | null;
  deliveryLandmark: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItem[];
  user: { id: string; email: string; firstName: string; lastName: string | null };
}

/**
 * Fiche détaillée d'une commande (brief admin) : articles, livraison et
 * client au même endroit, plutôt que le seul résumé disponible dans le
 * tableau. Le changement de statut reste possible ici — pas seulement dans la
 * liste — pour qui ouvre déjà la fiche avant de trancher.
 */
export function OrderDetail({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin", "orders", orderId],
    queryFn: () => adminFetch<AdminOrder>(`/orders/${orderId}`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      adminFetch<AdminOrder>(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: async (updated) => {
      setServerError(null);
      toast.success(`Statut passé à « ${orderStatusLabel(updated.status)} ».`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error: unknown) => {
      setServerError(
        error instanceof AdminApiError ? error.message : "Une erreur est survenue.",
      );
    },
  });

  if (isLoading || !order) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const hasDeliveryInfo = Boolean(
    order.recipientName ||
      order.deliveryPhone ||
      order.deliveryAddress ||
      order.deliveryCity,
  );
  const transitions = allowedTransitions(order.status);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/commandes"
        className="text-muted-foreground hover:text-secondary inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Toutes les commandes
      </Link>

      <AdminPageHeader
        title={order.orderNumber}
        description={`Passée le ${formatDateTime(order.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <OrderStatusBadge status={order.status} />
            {transitions.length > 0 && (
              <Select
                aria-label="Changer le statut de la commande"
                value=""
                disabled={statusMutation.isPending}
                onChange={(event) => {
                  const status = event.target.value;
                  if (status) statusMutation.mutate(status);
                  event.target.value = "";
                }}
                className="h-9 w-48 text-xs"
              >
                <option value="">Faire évoluer…</option>
                {transitions.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusLabel(status)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />

      <FormError message={serverError ?? undefined} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Client">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="type-label text-muted-foreground">Nom</dt>
              <dd className="text-secondary mt-0.5 font-medium">
                {order.user.firstName} {order.user.lastName ?? ""}
              </dd>
            </div>
            <div>
              <dt className="type-label text-muted-foreground">E-mail</dt>
              <dd className="text-secondary mt-0.5">{order.user.email}</dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel
          title="Livraison"
          description={!hasDeliveryInfo ? "Aucune information de livraison." : undefined}
        >
          {hasDeliveryInfo && (
            <dl className="space-y-3 text-sm">
              {order.recipientName && (
                <div>
                  <dt className="type-label text-muted-foreground">Destinataire</dt>
                  <dd className="text-secondary mt-0.5">{order.recipientName}</dd>
                </div>
              )}
              {order.deliveryPhone && (
                <div>
                  <dt className="type-label text-muted-foreground">Téléphone</dt>
                  <dd className="text-secondary mt-0.5">{order.deliveryPhone}</dd>
                </div>
              )}
              {(order.deliveryAddress || order.deliveryCity || order.deliveryCountry) && (
                <div>
                  <dt className="type-label text-muted-foreground">Adresse</dt>
                  <dd className="text-secondary mt-0.5">
                    {[
                      order.deliveryAddress,
                      order.deliveryDistrict,
                      order.deliveryCity,
                      order.deliveryCountry,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    {order.deliveryLandmark && (
                      <span className="type-caption block">
                        Repère : {order.deliveryLandmark}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Articles">
        <DataTable
          caption={`Articles de la commande ${order.orderNumber}`}
          className="rounded-none border-0"
          head={
            <>
              <th scope="col">Œuvre</th>
              <th scope="col">Format</th>
              <th scope="col" className="text-right!">
                Qté
              </th>
              <th scope="col" className="text-right!">
                Prix unitaire
              </th>
              <th scope="col" className="text-right!">
                Total
              </th>
            </>
          }
        >
          {order.items.length === 0 ? (
            <DataRowFull colSpan={5}>Aucun article.</DataRowFull>
          ) : (
            order.items.map((item) => (
              <DataRow key={item.id}>
                <td>
                  <p className="text-secondary font-medium">{item.workTitle}</p>
                  <p className="type-caption">{item.authorName}</p>
                </td>
                <td className="text-muted-foreground">{item.formatType}</td>
                <td className="tabular-nums text-right">{item.quantity}</td>
                <td className="tabular-nums text-right">{formatPrice(item.unitPrice)}</td>
                <td className="text-secondary tabular-nums text-right font-semibold">
                  {formatPrice(item.lineTotal)}
                </td>
              </DataRow>
            ))
          )}
        </DataTable>

        <dl className="border-border mt-4 space-y-2 border-t px-1 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sous-total</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Livraison</dt>
            <dd className="tabular-nums">{formatPrice(order.deliveryFee)}</dd>
          </div>
          {Number(order.discountAmount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Remise</dt>
              <dd className="tabular-nums">-{formatPrice(order.discountAmount)}</dd>
            </div>
          )}
          <div className="border-border flex justify-between border-t pt-2 font-semibold">
            <dt className="text-secondary">Total</dt>
            <dd className="text-secondary tabular-nums">{formatPrice(order.totalAmount)}</dd>
          </div>
        </dl>
      </AdminPanel>

      {(order.paidAt || order.cancelledAt) && (
        <AdminPanel title="Historique">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {order.paidAt && (
              <div>
                <dt className="type-label text-muted-foreground">Payée le</dt>
                <dd className="text-secondary mt-0.5">{formatDateTime(order.paidAt)}</dd>
              </div>
            )}
            {order.cancelledAt && (
              <div>
                <dt className="type-label text-muted-foreground">Annulée le</dt>
                <dd className="text-secondary mt-0.5">
                  {formatDateTime(order.cancelledAt)}
                </dd>
              </div>
            )}
          </dl>
        </AdminPanel>
      )}
    </div>
  );
}
