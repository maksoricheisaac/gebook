"use client";

import { useEffect, useState } from "react";

import {
  DateRangePicker,
  rangeForPreset,
  type DateRange,
} from "@/src/components/admin/date-range-picker";
import { RevenueChart } from "@/src/components/admin/revenue-chart";
import { Button } from "@/src/components/ui/button";
import { ErrorState } from "@/src/components/ui/states";
import { authorFetch } from "@/src/lib/author-api";
import type { RevenueTimeseriesPoint } from "@/src/lib/commissions";

function buildQuery(range: DateRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

/**
 * Courbe de ce qui revient à l'auteur, jour par jour (parité avec le graphe
 * déjà présent sur les tableaux de bord plateforme/espace).
 *
 * Pas de React Query ici : `QueryProvider` est délibérément réservé au
 * back-office (les pages publiques sont rendues côté serveur, voir
 * `query-provider.tsx`) — cette page vit dans `(site)`, pas `(admin)`. L'état
 * de la période et son rechargement restent donc un simple
 * `useState`/`useEffect`, exactement ce que `DateRangePicker` attend de son
 * appelant.
 */
export function AuthorRevenueChartSection() {
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("30d"));
  const [timeseries, setTimeseries] = useState<RevenueTimeseriesPoint[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Reset avant le rechargement déclenché par un changement de période —
    // même idiome que `cart-provider.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setIsError(false);

    authorFetch<RevenueTimeseriesPoint[]>(`/me/sales/timeseries${buildQuery(range)}`)
      .then((data) => {
        if (!cancelled) setTimeseries(data);
      })
      .catch(() => {
        if (!cancelled) setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, reloadToken]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-h3 text-secondary mb-1">Ce qui vous revient</h2>
          <p className="text-muted-foreground text-sm">
            Somme de vos ventes, jour par jour, sur la période choisie.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="border-border bg-card rounded-lg border p-5">
        {isLoading ? (
          <div className="bg-paper-200 h-64 w-full animate-pulse rounded-md" />
        ) : isError || !timeseries ? (
          <ErrorState
            description="Le graphe n’a pas pu être chargé."
            className="border-0 bg-transparent py-8"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Réessayer
            </Button>
          </ErrorState>
        ) : timeseries.every((point) => Number(point.revenueCollected) === 0) ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Aucun montant sur cette période.
          </p>
        ) : (
          <RevenueChart data={timeseries} label="Vous revient" />
        )}
      </div>
    </section>
  );
}
