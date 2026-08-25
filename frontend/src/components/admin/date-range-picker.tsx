"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

import { Input, Select } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/lib/utils";

export interface DateRange {
  from: string;
  to: string;
}

type Preset = "today" | "7d" | "30d" | "month" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  today: "Aujourd’hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  month: "Ce mois",
  custom: "Période personnalisée",
};

/** ISO horodaté — suffisant pour une borne de filtre, lisible dans les DevTools. */
function toIso(date: Date): string {
  return date.toISOString();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Bornes concrètes d'un préréglage — la seule fonction que le composant appelant a besoin d'invoquer pour obtenir une valeur initiale cohérente. */
export function rangeForPreset(preset: Exclude<Preset, "custom">): DateRange {
  const now = new Date();

  switch (preset) {
    case "today":
      return { from: toIso(startOfDay(now)), to: toIso(endOfDay(now)) };
    case "7d": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return { from: toIso(from), to: toIso(endOfDay(now)) };
    }
    case "30d": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 29);
      return { from: toIso(from), to: toIso(endOfDay(now)) };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(from), to: toIso(endOfDay(now)) };
    }
  }
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Sélecteur de période du tableau de bord (brief : « aujourd'hui, 7 derniers
 * jours, 30 derniers jours, ce mois, personnalisée »).
 *
 * Composant purement de présentation : il calcule les bornes d'un préréglage
 * et les transmet via `onChange`, mais ne fait lui-même aucun appel réseau —
 * la page appelante décide quoi recharger, avec React Query comme partout
 * ailleurs dans le back-office.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  // Le préréglage actif n'est pas dérivable de `value` seul (deux préréglages
  // peuvent en théorie produire des bornes identiques à la seconde près) : il
  // reste donc un état local, initialisé sur « 30 derniers jours » — le
  // comportement historique du tableau de bord avant ce sélecteur.
  const [preset, setPreset] = useState<Preset>("30d");

  const handlePresetChange = (next: Preset): void => {
    setPreset(next);
    if (next !== "custom") {
      onChange(rangeForPreset(next));
    }
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="grid gap-1.5">
        <Label htmlFor="dashboard-period" className="text-secondary text-sm font-semibold">
          <Calendar aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
          Période
        </Label>
        <Select
          id="dashboard-period"
          value={preset}
          onChange={(event) => handlePresetChange(event.target.value as Preset)}
          className="h-10 w-52"
        >
          {(Object.keys(PRESET_LABELS) as Preset[]).map((key) => (
            <option key={key} value={key}>
              {PRESET_LABELS[key]}
            </option>
          ))}
        </Select>
      </div>

      {preset === "custom" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard-from" className="text-secondary text-sm font-semibold">
              Du
            </Label>
            <Input
              id="dashboard-from"
              type="date"
              className="h-10 w-40"
              value={toDateInputValue(value.from)}
              max={toDateInputValue(value.to)}
              onChange={(event) => {
                if (!event.target.value) return;
                onChange({ from: toIso(startOfDay(new Date(event.target.value))), to: value.to });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard-to" className="text-secondary text-sm font-semibold">
              Au
            </Label>
            <Input
              id="dashboard-to"
              type="date"
              className="h-10 w-40"
              value={toDateInputValue(value.to)}
              min={toDateInputValue(value.from)}
              max={toDateInputValue(toIso(new Date()))}
              onChange={(event) => {
                if (!event.target.value) return;
                onChange({ from: value.from, to: toIso(endOfDay(new Date(event.target.value))) });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
