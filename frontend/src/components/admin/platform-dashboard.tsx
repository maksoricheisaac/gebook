"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AdminPageHeader, AdminStatCard, AdminStatGrid } from "@/src/components/admin/admin-page";
import { DateRangePicker, rangeForPreset, type DateRange } from "@/src/components/admin/date-range-picker";
import { RevenueChart } from "@/src/components/admin/revenue-chart";
import { Button } from "@/src/components/ui/button";
import { ErrorState } from "@/src/components/ui/states";
import { adminFetch } from "@/src/lib/admin-api";
import type { PlatformStatistics, RevenueTimeseriesPoint } from "@/src/lib/commissions";
import { formatPrice } from "@/src/lib/format";
import type { CurrentUser } from "@/src/lib/auth-shared";

/**
 * Chiffres de catalogue : des états actuels (combien d'œuvres sont publiées
 * *maintenant*), pas des événements datés — ils ne bougent donc pas avec la
 * période sélectionnée, contrairement aux ventes ci-dessous. Résolus côté
 * serveur (`app/(admin)/admin/page.tsx`) via l'API publique du catalogue,
 * exactement comme avant ce composant.
 */
export interface CatalogSnapshot {
  publishedWorks: number;
  featuredWorks: number;
  authorsCount: number;
  emptyCategories: number;
}

function buildQuery(range: DateRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export function PlatformDashboard({
  user,
  catalog,
}: {
  user: CurrentUser;
  catalog: CatalogSnapshot;
}) {
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("30d"));

  const {
    data: statistics,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["admin", "statistics", range.from, range.to],
    queryFn: () => adminFetch<PlatformStatistics>(`/statistics${buildQuery(range)}`),
  });

  const {
    data: timeseries,
    isLoading: isTimeseriesLoading,
    isError: isTimeseriesError,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ["admin", "statistics", "timeseries", range.from, range.to],
    queryFn: () =>
      adminFetch<RevenueTimeseriesPoint[]>(`/statistics/timeseries${buildQuery(range)}`),
  });

  return (
    <>
      <AdminPageHeader
        title={`Bonjour, ${user.firstName}.`}
        description="Vue du catalogue tel qu’il apparaît publiquement, et des ventes sur la période choisie."
        actions={
          <Button asChild variant="outline">
            <Link href="/livres" target="_blank" rel="noreferrer">
              Voir le site public
            </Link>
          </Button>
        }
      />

      <AdminStatGrid>
        <AdminStatCard label="Œuvres en ligne" value={catalog.publishedWorks} />
        <AdminStatCard label="Mises en avant" value={catalog.featuredWorks} />
        <AdminStatCard label="Auteurs publiés" value={catalog.authorsCount} />
        <AdminStatCard
          label="Domaines sans ouvrage"
          value={catalog.emptyCategories}
          hint={
            catalog.emptyCategories > 0
              ? "invisibles sur l’accueil"
              : "tous les domaines sont peuplés"
          }
        />
      </AdminStatGrid>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="type-h3 text-secondary mb-1">Ventes et commissions</h2>
            <p className="text-muted-foreground text-sm">
              Montants encaissés et répartitions figées, sur la période choisie.
            </p>
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>

        {isStatsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-paper-200 h-28 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : isStatsError || !statistics ? (
          <ErrorState description="Les chiffres de vente n’ont pas pu être chargés.">
            <Button type="button" variant="outline" size="sm" onClick={() => void refetchStats()}>
              Réessayer
            </Button>
          </ErrorState>
        ) : (
          <AdminStatGrid>
            <AdminStatCard label="Commandes réglées" value={statistics.paidOrders} />
            <AdminStatCard label="Encaissé" value={formatPrice(statistics.revenueCollected)} />
            <AdminStatCard label="Commission GeBook" value={formatPrice(statistics.commissionTotal)} />
            <AdminStatCard
              label="Dû aux auteurs"
              value={formatPrice(statistics.authorNetTotal)}
              hint={`dont ${formatPrice(statistics.pendingPayout)} à verser au total`}
            />
          </AdminStatGrid>
        )}
      </section>

      <section className="mt-10">
        <h2 className="type-h3 text-secondary mb-1">Encaissement</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Somme des paiements confirmés, jour par jour, sur la période choisie.
        </p>
        <div className="border-border bg-card rounded-lg border p-5">
          {isTimeseriesLoading ? (
            <div className="bg-paper-200 h-64 w-full animate-pulse rounded-md" />
          ) : isTimeseriesError || !timeseries ? (
            <ErrorState description="Le graphe n’a pas pu être chargé." className="border-0 bg-transparent py-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetchTimeseries()}
              >
                Réessayer
              </Button>
            </ErrorState>
          ) : timeseries.every((point) => Number(point.revenueCollected) === 0) ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucun encaissement sur cette période.
            </p>
          ) : (
            <RevenueChart data={timeseries} />
          )}
        </div>
      </section>
    </>
  );
}
