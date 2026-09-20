"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { AdminPagination } from "@/src/components/admin/admin-pagination";
import { AdminTablePanel } from "@/src/components/admin/admin-page";
import { IdCell } from "@/src/components/admin/id-cell";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { Input } from "@/src/components/ui/input";
import { ErrorState, RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";
import { activityActionLabel, activityEntityLabel } from "@/src/lib/activity-log";
import { formatDateTime } from "@/src/lib/format";

interface ActivityLogEntry {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

const PER_PAGE = 20;

/**
 * Journal d'activité du back-office.
 *
 * L'API (`ActivityLogService.list`) applique déjà la portée réelle : un
 * superadmin voit tout, un owner/admin de tenant ne voit que son propre
 * espace (policy RLS `activity_logs_select`). Ce composant n'a donc qu'à
 * afficher ce qui revient, et à distinguer un 403 (rôle insuffisant) d'une
 * vraie erreur de chargement.
 */
export function ActivityLogManager({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- même idiome que `order-list.tsx`
    setPage(1);
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "logs", page, search],
    queryFn: () =>
      adminFetch<Paginated<ActivityLogEntry>>(
        `/logs?page=${page}&perPage=${PER_PAGE}` +
          (search ? `&action=${encodeURIComponent(search)}` : ""),
      ),
  });

  if (isError && error instanceof AdminApiError && error.statusCode === 403) {
    return <ErrorState title="Accès non autorisé" description={error.message} />;
  }

  const entries = data?.data ?? [];

  return (
    <AdminTablePanel
      title="Journal d'activité"
      description={
        data
          ? `${data.meta.total} événement${data.meta.total > 1 ? "s" : ""} au total.`
          : undefined
      }
      actions={
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            placeholder="Rechercher une action…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full pl-8 sm:w-56"
            aria-label="Rechercher dans le journal"
          />
        </div>
      }
    >
      {isLoading ? (
        <TableSkeleton rows={6} columns={isPlatformAdmin ? 6 : 5} />
      ) : isError ? (
        <RetryRow onRetry={() => void refetch()} label="événements du journal" />
      ) : (
        <>
          <DataTable
            caption="Journal d'activité"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">#</th>
                <th scope="col">Date</th>
                <th scope="col">Action</th>
                <th scope="col">Concerne</th>
                <th scope="col">Auteur de l’action</th>
                {isPlatformAdmin && <th scope="col">Espace</th>}
              </>
            }
          >
            {entries.length === 0 ? (
              <DataRowFull colSpan={isPlatformAdmin ? 6 : 5}>
                {search
                  ? "Aucun événement ne correspond à cette recherche."
                  : "Aucun événement pour le moment."}
              </DataRowFull>
            ) : (
              entries.map((entry) => {
                const entityLabel = activityEntityLabel(entry.entityType);
                return (
                  <DataRow key={entry.id}>
                    <td>
                      <IdCell id={entry.id} />
                    </td>
                    <td className="text-muted-foreground tnum whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td>
                      <span className="text-secondary font-medium">
                        {activityActionLabel(entry.action)}
                      </span>
                      {entry.description && (
                        <span className="type-caption block">{entry.description}</span>
                      )}
                    </td>
                    <td className="text-muted-foreground">
                      {entityLabel ? (
                        <>
                          {entityLabel}
                          {entry.entityId && (
                            <span className="ml-1">
                              <IdCell id={entry.entityId} length={6} />
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-muted-foreground">
                      {entry.userName ?? entry.userEmail ?? "Système"}
                    </td>
                    {isPlatformAdmin && (
                      <td className="text-muted-foreground">{entry.tenantName ?? "—"}</td>
                    )}
                  </DataRow>
                );
              })
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
  );
}
