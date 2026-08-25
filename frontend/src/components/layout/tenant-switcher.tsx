"use client";

import { useId } from "react";
import { Building2 } from "lucide-react";
import { useTenant } from "@/src/components/providers/tenant-provider";
import { Select } from "@/src/components/ui/input";

/**
 * Sélecteur de tenant actif.
 *
 * N'apparaît que lorsque l'utilisateur appartient à plusieurs tenants (brief
 * §4) — sinon, un espace unique n'a rien à faire basculer. La liste déroulante
 * est native (comme `Select`, `ui/input.tsx`) : au clavier comme au tactile,
 * c'est le composant le plus prévisible pour un choix parmi quelques options.
 */
export function TenantSwitcher() {
  const { memberships, activeTenantId, isSwitching, switchError, switchTenant } =
    useTenant();
  const labelId = useId();

  if (memberships.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Building2 aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <label id={labelId} htmlFor={`${labelId}-select`} className="type-caption">
          Espace actif
        </label>
      </div>

      <Select
        id={`${labelId}-select`}
        value={activeTenantId ?? ""}
        disabled={isSwitching}
        onChange={(event) => {
          void switchTenant(event.target.value);
        }}
        className="max-w-xs"
      >
        {memberships.map((membership) => (
          <option key={membership.tenantId} value={membership.tenantId}>
            {membership.tenantName}
          </option>
        ))}
      </Select>

      {switchError && <p className="text-destructive text-xs">{switchError}</p>}
    </div>
  );
}
