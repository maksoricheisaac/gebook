"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Clock3, PackageCheck, ReceiptText, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AdminStatCard, AdminStatGrid, AdminTablePanel } from "@/src/components/admin/admin-page";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { FormError } from "@/src/components/ui/field";
import { Select } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { formatDateTime, formatPrice } from "@/src/lib/format";
import { ORDER_STATUS_LABELS, orderStatusLabel } from "@/src/lib/order-status-labels";
import { allowedTransitions, OrderStatusBadge } from "@/src/lib/order-status";

interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  user: { email: string; firstName: string; lastName: string | null };
}

interface Paginated<T> {
  data: T[];
  meta: { total: number };
}

interface OrderStats {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
}

const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABELS);

/**
 * Liste des commandes du back-office.
 *
 * Le changement de statut reste une liste déroulante par ligne — c'est l'action
 * la plus fréquente et elle doit tenir en un geste. Deux différences avec la
 * version précédente :
 *
 *   - le badge d'état porte enfin une couleur qui distingue « Payée » de
 *     « Annulée » et de « En attente » (voir `lib/order-status.tsx`) ;
 *   - la ligne en cours de mise à jour est marquée, et un message d'état est
 *     annoncé aux lecteurs d'écran. Avant, la mutation se faisait en silence et
 *     rien ne signalait qu'un changement était parti ou avait échoué.
 */
export function OrderList() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "orders", statusFilter],
    queryFn: () =>
      adminFetch<Paginated<AdminOrder>>(
        `/orders?perPage=100${statusFilter ? `&status=${statusFilter}` : ""}`,
      ),
  });

  // Chiffres calculés en base, indépendants du filtre de statut appliqué au
  // tableau — sinon « Payées » tomberait à zéro dès qu'on filtre sur « En
  // attente » — et non plafonnés à `perPage`, contrairement à une liste.
  const { data: stats } = useQuery({
    queryKey: ["admin", "orders", "stats"],
    queryFn: () => adminFetch<OrderStats>("/orders/stats"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch<AdminOrder>(`/orders/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: async (order) => {
      setServerError(null);
      const message = `Commande ${order.orderNumber} : statut passé à « ${orderStatusLabel(order.status)} ».`;
      setNotice(message);
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error: unknown) => {
      setNotice(null);
      const message =
        error instanceof AdminApiError ? error.message : "Une erreur est survenue.";
      setServerError(message);
      toast.error(message);
    },
    onSettled: () => setPendingId(null),
  });

  const orders = data?.data ?? [];

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard label="Commandes" value={stats?.total ?? data?.meta.total ?? 0} icon={ReceiptText} />
        <AdminStatCard label="Payées" value={stats?.paid ?? 0} icon={PackageCheck} />
        <AdminStatCard label="En attente" value={stats?.pending ?? 0} icon={Clock3} />
        <AdminStatCard label="Annulées" value={stats?.cancelled ?? 0} icon={XCircle} />
      </AdminStatGrid>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Label
            htmlFor="order-status-filter"
            className="text-secondary text-sm font-semibold"
          >
            Filtrer par statut
          </Label>
          <Select
            id="order-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-56"
          >
            <option value="">Tous les statuts</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabel(status)}
              </option>
            ))}
          </Select>
        </div>

        {!isLoading && (
          <p className="type-meta pb-3">
            {data?.meta.total ?? 0}{" "}
            {(data?.meta.total ?? 0) > 1 ? "commandes" : "commande"}
          </p>
        )}
      </div>

      <FormError message={serverError ?? undefined} />

      {/* Confirmation annoncée sans voler le focus : l'administrateur enchaîne
          souvent plusieurs changements de statut à la suite. */}
      <p aria-live="polite" className="text-primary text-sm">
        {notice}
      </p>

      <AdminTablePanel
        title="Commandes"
        description="Le changement de statut est appliqué immédiatement."
      >
        {isLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : isError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Les commandes n’ont pas pu être chargées.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-primary mt-2 cursor-pointer text-sm font-semibold hover:underline"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <DataTable
            caption="Commandes des lecteurs"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">Commande</th>
                <th scope="col">Client</th>
                <th scope="col">Date</th>
                <th scope="col" className="text-right!">
                  Total
                </th>
                <th scope="col">Statut</th>
                <th scope="col" className="text-right!">
                  Actions
                </th>
              </>
            }
          >
            {orders.length === 0 ? (
              <DataRowFull colSpan={6}>
                {statusFilter
                  ? "Aucune commande avec ce statut."
                  : "Aucune commande pour le moment."}
              </DataRowFull>
            ) : (
              orders.map((order) => (
                <DataRow
                  key={order.id}
                  className={pendingId === order.id ? "opacity-55" : undefined}
                >
                  <td className="text-secondary tnum font-medium">{order.orderNumber}</td>
                  <td>
                    <p className="text-secondary">
                      {order.user.firstName} {order.user.lastName ?? ""}
                    </p>
                    <p className="type-caption">{order.user.email}</p>
                  </td>
                  <td className="text-muted-foreground tnum whitespace-nowrap">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="text-secondary tnum text-right font-semibold">
                    {formatPrice(order.totalAmount)}
                  </td>
                  <td>
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {/* Seules les suites possibles sont proposées. Un statut
                          terminal (annulée, remboursée) n'a plus de menu du
                          tout, plutôt qu'un menu dont chaque choix échoue. */}
                      {allowedTransitions(order.status).length > 0 ? (
                        <Select
                          aria-label={`Changer le statut de la commande ${order.orderNumber}`}
                          value=""
                          disabled={statusMutation.isPending}
                          onChange={(event) => {
                            const status = event.target.value;
                            if (status) {
                              setPendingId(order.id);
                              statusMutation.mutate({ id: order.id, status });
                            }
                            event.target.value = "";
                          }}
                          className="h-9 w-40 text-xs"
                        >
                          <option value="">Faire évoluer…</option>
                          {allowedTransitions(order.status).map((status) => (
                            <option key={status} value={status}>
                              {orderStatusLabel(status)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="type-caption">Statut final</span>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/commandes/${order.id}`}>
                          Gérer
                          <span className="sr-only"> — {order.orderNumber}</span>
                        </Link>
                      </Button>
                    </div>
                  </td>
                </DataRow>
              ))
            )}
          </DataTable>
        )}
      </AdminTablePanel>
    </div>
  );
}
