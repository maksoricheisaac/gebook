"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BookText, Percent, ReceiptText, Users, UserSquare2 } from "lucide-react";

import {
  AdminPageHeader,
  AdminStatCard,
  AdminStatGrid,
} from "@/src/components/admin/admin-page";
import {
  DateRangePicker,
  rangeForPreset,
  type DateRange,
} from "@/src/components/admin/date-range-picker";
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
  ordersCount: number;
  readersCount: number;
  revenueCollected: string;
  commissionTotal: string;
  authorNetTotal: string;
  pendingPayout: string;
  availableBalance: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: profile } = useQuery({
    queryKey: ["admin", "tenant-settings"],
    queryFn: () => adminFetch<TenantProfile>("/tenant"),
  });

  // Moment d'accueil après « Créer mon espace » (Phase 2, onboarding) :
  // `createTenantAction` redirige ici avec `?espace_cree=1`. Le nom de
  // l'espace apparaît déjà juste en dessous dans l'en-tête — le message reste
  // donc générique et n'attend pas `profile` pour s'afficher. Le paramètre
  // est retiré de l'URL après lecture pour qu'un rafraîchissement de la page
  // ne redéclenche pas le message.
  useEffect(() => {
    if (searchParams.get("espace_cree") !== "1") {
      return;
    }
    toast.success("Votre espace est prêt.", {
      description: "Ajoutez vos auteurs et publiez vos premières œuvres dès maintenant.",
    });
    router.replace("/admin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const {
    data: statistics,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "tenant-statistics", range.from, range.to],
    queryFn: () => adminFetch<TenantStatistics>(`/tenant/statistics${buildQuery(range)}`),
  });

  return (
    <>
      <AdminPageHeader
        title={`Bonjour, ${user.firstName}.`}
        description={
          profile
            ? `Vue d’ensemble de « ${profile.name} ».`
            : "Vue d’ensemble de votre espace."
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            Réessayer
          </Button>
        </ErrorState>
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard
              label="Œuvres publiées"
              value={statistics.publishedWorks}
              icon={BookText}
            />
            <AdminStatCard
              label="Auteurs actifs"
              value={statistics.activeAuthors}
              icon={UserSquare2}
            />
            <AdminStatCard label="Ventes" value={statistics.salesCount} icon={Percent} />
            <AdminStatCard
              label="Commandes"
              value={statistics.ordersCount}
              icon={ReceiptText}
            />
            <AdminStatCard
              label="Lecteurs"
              value={statistics.readersCount}
              icon={Users}
            />
            <AdminStatCard
              label="Encaissé"
              value={formatPrice(statistics.revenueCollected)}
            />
          </AdminStatGrid>

          <section className="mt-6">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AdminStatCard
                label="Commission GeBook"
                value={formatPrice(statistics.commissionTotal)}
              />
              <AdminStatCard
                label="Dû aux auteurs"
                value={formatPrice(statistics.authorNetTotal)}
              />
              <AdminStatCard
                label="Solde disponible"
                value={formatPrice(statistics.availableBalance)}
                hint="Aucun reversement automatique n’existe encore — ce solde n’a pas été versé."
              />
            </dl>
          </section>
        </>
      )}
    </>
  );
}
