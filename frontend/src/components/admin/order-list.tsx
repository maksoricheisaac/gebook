"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  PackageCheck,
  ReceiptText,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AdminPagination } from "@/src/components/admin/admin-pagination";
import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { IdCell } from "@/src/components/admin/id-cell";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { FormError } from "@/src/components/ui/field";
import { Input, Select } from "@/src/components/ui/input";
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
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

interface OrderStats {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
}

const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABELS);
const PER_PAGE = 20;

type SortField = "orderNumber" | "createdAt" | "totalAmount";
type SortDir = "asc" | "desc";

/**
 * Liste des commandes du back-office.
 *
 * Le changement de statut reste une liste déroulante par ligne — c'est l'action
 * la plus fréquente et elle doit tenir en un geste. Recherche, filtre par
 * statut et tri des colonnes passent tous par le serveur (`AdminListOrdersQuery`)
 * plutôt que de charger 100 lignes pour les retrier en mémoire — la pagination
 * réelle (`AdminPagination`) en dépend directement.
 */
export function OrderList() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Un changement de recherche ou de filtre doit revenir à la page 1 : voir
  // le même raisonnement dans `work-list.tsx`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- même idiome que `cart-provider.tsx`
    setPage(1);
  }, [statusFilter, search]);

  const toggleSort = (field: SortField): void => {
    if (field === sortBy) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "orders", page, statusFilter, search, sortBy, sortDir],
    queryFn: () =>
      adminFetch<Paginated<AdminOrder>>(
        `/orders?page=${page}&perPage=${PER_PAGE}&sortBy=${sortBy}&sortDir=${sortDir}` +
          (statusFilter ? `&status=${statusFilter}` : "") +
          (search ? `&q=${encodeURIComponent(search)}` : ""),
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

  const sortIcon = (field: SortField): React.ReactNode => {
    if (sortBy !== field) {
      return <ArrowUpDown aria-hidden className="size-3.5 opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp aria-hidden className="size-3.5" />
    ) : (
      <ArrowDown aria-hidden className="size-3.5" />
    );
  };

  const sortableHeader = (field: SortField, label: string): React.ReactNode => (
    <th scope="col">
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="hover:text-secondary inline-flex cursor-pointer items-center gap-1"
      >
        {label}
        {sortIcon(field)}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard
          label="Commandes"
          value={stats?.total ?? data?.meta.total ?? 0}
          icon={ReceiptText}
        />
        <AdminStatCard label="Payées" value={stats?.paid ?? 0} icon={PackageCheck} />
        <AdminStatCard label="En attente" value={stats?.pending ?? 0} icon={Clock3} />
        <AdminStatCard label="Annulées" value={stats?.cancelled ?? 0} icon={XCircle} />
      </AdminStatGrid>

      <FormError message={serverError ?? undefined} />

      {/* Confirmation annoncée sans voler le focus : l'administrateur enchaîne
          souvent plusieurs changements de statut à la suite. */}
      <p aria-live="polite" className="text-primary text-sm">
        {notice}
      </p>

      <AdminTablePanel
        title="Commandes"
        description={
          data
            ? `${data.meta.total} au total. Le changement de statut est appliqué immédiatement.`
            : undefined
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                placeholder="N° de commande, client…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full pl-8 sm:w-56"
                aria-label="Rechercher une commande"
              />
            </div>
            <Select
              aria-label="Filtrer par statut"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 w-full sm:w-48"
            >
              <option value="">Tous les statuts</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {orderStatusLabel(status)}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <TableSkeleton rows={5} columns={7} />
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
          <>
            <DataTable
              caption="Commandes des lecteurs"
              className="rounded-none border-0"
              head={
                <>
                  <th scope="col">#</th>
                  {sortableHeader("orderNumber", "Commande")}
                  <th scope="col">Client</th>
                  {sortableHeader("createdAt", "Date")}
                  <th scope="col" className="text-right!">
                    {sortableHeader("totalAmount", "Total")}
                  </th>
                  <th scope="col">Statut</th>
                  <th scope="col" className="text-right!">
                    Actions
                  </th>
                </>
              }
            >
              {orders.length === 0 ? (
                <DataRowFull colSpan={7}>
                  {statusFilter || search
                    ? "Aucune commande ne correspond à ces critères."
                    : "Aucune commande pour le moment."}
                </DataRowFull>
              ) : (
                orders.map((order) => (
                  <DataRow
                    key={order.id}
                    className={pendingId === order.id ? "opacity-55" : undefined}
                  >
                    <td>
                      <IdCell id={order.id} />
                    </td>
                    <td className="text-secondary tnum font-medium">
                      {order.orderNumber}
                    </td>
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
                        {allowedTransitions(order.status).length > 0 && (
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
            {data && (
              <AdminPagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </AdminTablePanel>
    </div>
  );
}
