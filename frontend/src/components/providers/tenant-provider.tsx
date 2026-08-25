"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveTenantAction } from "@/src/lib/tenant-actions";
import type { TenantMemberRole, TenantMembership } from "@/src/lib/tenant-shared";

interface TenantContextValue {
  /** Toutes les adhésions réelles de l'utilisateur — vide hors contexte multi-tenant. */
  memberships: TenantMembership[];
  activeTenantId: string | null;
  activeTenant: TenantMembership | null;
  /** Rôle de l'utilisateur *dans le tenant actif* — pas son rôle global. */
  role: TenantMemberRole | null;
  isSwitching: boolean;
  switchError: string | null;
  /** Bascule vers un tenant, validé côté API avant toute mise à jour locale. */
  switchTenant: (tenantId: string) => Promise<boolean>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Contexte tenant centralisé (Phase 5, brief §3-4).
 *
 * `memberships` et `initialActiveTenantId` sont résolus côté serveur
 * (`resolveActiveTenant()`, `tenant.ts`) et transmis en props : la coquille
 * qui monte ce provider sait déjà, avant le premier rendu client, quel tenant
 * est actif — pas de flash ni de second appel réseau au montage.
 *
 * `activeTenantId` fourni ici n'est JAMAIS une preuve d'autorisation : il ne
 * sert qu'à décider quoi afficher. La protection réelle des données reste
 * PostgreSQL/RLS (Phase 4), qui revalide tout côté serveur indépendamment de
 * ce que ce contexte affirme.
 */
export function TenantProvider({
  memberships,
  initialActiveTenantId,
  children,
}: {
  memberships: TenantMembership[];
  initialActiveTenantId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [activeTenantId, setActiveTenantId] = useState(initialActiveTenantId);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSwitching, startTransition] = useTransition();

  const activeTenant = useMemo(
    () => memberships.find((m) => m.tenantId === activeTenantId) ?? null,
    [memberships, activeTenantId],
  );

  const switchTenant = (tenantId: string): Promise<boolean> => {
    setSwitchError(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await setActiveTenantAction(tenantId);

        if (result.error || !result.membership) {
          setSwitchError(result.error ?? "Impossible de changer d'espace.");
          resolve(false);
          return;
        }

        setActiveTenantId(result.membership.tenantId);
        // Les Server Components de la page (données du tenant actif) doivent
        // être relus avec le nouveau contexte — un simple état client ne
        // suffit pas à rafraîchir ce qu'ils ont déjà rendu.
        router.refresh();
        resolve(true);
      });
    });
  };

  const value: TenantContextValue = {
    memberships,
    activeTenantId,
    activeTenant,
    role: activeTenant?.role ?? null,
    isSwitching,
    switchError,
    switchTenant,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant() doit être appelé sous <TenantProvider>.");
  }
  return context;
}
