"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookText, Percent, UserSquare2 } from "lucide-react";

import { AdminPageHeader, AdminStatCard, AdminStatGrid } from "@/src/components/admin/admin-page";
import { DateRangePicker, rangeForPreset, type DateRange } from "@/src/components/admin/date-range-picker";
import { Button } from "@/src/components/ui/button";
import { ErrorState } from "@/src/components/ui/states";
import { adminFetch } from "@/src/lib/admin-api";
import { formatPrice } from "@/src/lib/format";
import type { CurrentUser } from "@/src/lib/auth-shared";

interface TenantProfile {
  name: string;
}

interface TenantStatistics {
  publishedWorks: number;
  activeAuthors: number;
  salesCount: number;
  revenueCollected: string;
  commissionTotal: string;
  authorNetTotal: string;
  pendingPayout: string;
}

function buildQuery(range: DateRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

/**
 * Tableau de bord d'un espace (brief §7 "Tenant Dashboard").
 *
 * Distinct du tableau de bord plateforme : les chiffres viennent de
 * `/admin/tenant/statistics`, scopés au tenant actif par RLS — un membre
 * owner/admin/finance y voit exactement ses propres ventes, jamais celles
 * d'un autre espace. Rendu côté client (comme les autres pages admin) parce
 * que le tenant actif dépend d'un cookie que seul un composant client relit
 * de façon cohérente avec le reste du back-office.
 */
export function TenantDashboard({ user }: { user: CurrentUser }) {
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("30d"));

  const { data: profile } = useQuery({
    queryKey: ["admin", "tenant-settings"],
    queryFn: () => adminFetch<TenantProfile>("/tenant"),
  });

  const {
    data: statistics,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "tenant-statistics", range.from, range.to],
    queryFn: () =>
      adminFetch<TenantStatistics>(`/tenant/statistics${buildQuery(range)}`),
  });

  return (
    <>
      <AdminPageHeader
        title={`Bonjour, ${user.firstName}.`}
        description={
          profile ? `Vue d’ensemble de « ${profile.name} ».` : "Vue d’ensemble de votre espace."
        }
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-h3 text-secondary mb-1">Ventes de l’espace</h2>
          <p className="text-muted-foreground text-sm">Sur la période choisie.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-paper-200 h-28 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isError || !statistics ? (
        <ErrorState description="Les chiffres de cet espace n’ont pas pu être chargés.">
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </ErrorState>
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="Œuvres publiées" value={statistics.publishedWorks} icon={BookText} />
            <AdminStatCard label="Auteurs actifs" value={statistics.activeAuthors} icon={UserSquare2} />
            <AdminStatCard label="Ventes" value={statistics.salesCount} icon={Percent} />
            <AdminStatCard label="Encaissé" value={formatPrice(statistics.revenueCollected)} />
          </AdminStatGrid>

          <section className="mt-6">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              <AdminStatCard label="Commission GeBook" value={formatPrice(statistics.commissionTotal)} />
              <AdminStatCard
                label="Dû aux auteurs"
                value={formatPrice(statistics.authorNetTotal)}
                hint={`dont ${formatPrice(statistics.pendingPayout)} à verser au total`}
              />
            </dl>
          </section>
        </>
      )}
    </>
  );
}
