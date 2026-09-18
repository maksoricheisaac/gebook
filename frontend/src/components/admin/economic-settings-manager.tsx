"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AlertTriangle, Calculator, Save } from "lucide-react";
import { toast } from "sonner";

import { AdminPanel } from "@/src/components/admin/admin-page";
import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";

interface EconomicSettings {
  payoutMinThreshold: string | null;
  payoutDelayDays: number | null;
  payoutFeePercent: string | null;
  payoutFrequency: "manual" | "weekly" | "biweekly" | "monthly" | null;
  payoutValidationMode: "manual" | "automatic" | null;
  payoutCurrency: string | null;
  simulatorProviderFeePercent: string | null;
  undefinedKeys: string[];
}

interface EconomicSettingsFormValues {
  payoutMinThreshold: string;
  payoutDelayDays: string;
  payoutFeePercent: string;
  payoutFrequency: string;
  payoutValidationMode: string;
  payoutCurrency: string;
  simulatorProviderFeePercent: string;
}

const FIELD_LABELS: Record<string, string> = {
  "economic.payout_min_threshold": "Seuil minimum de retrait",
  "economic.payout_delay_days": "Délai avant disponibilité",
  "economic.payout_fee_percent": "Commission sur un retrait",
  "economic.payout_frequency": "Fréquence de traitement",
  "economic.payout_validation_mode": "Validation des retraits",
  "economic.payout_currency": "Devise",
  "economic.simulator_provider_fee_percent": "Frais de paiement estimés (simulateur)",
};

function toFormValues(settings?: EconomicSettings): EconomicSettingsFormValues {
  return {
    payoutMinThreshold: settings?.payoutMinThreshold ?? "",
    payoutDelayDays:
      settings?.payoutDelayDays !== undefined && settings?.payoutDelayDays !== null
        ? String(settings.payoutDelayDays)
        : "",
    payoutFeePercent: settings?.payoutFeePercent ?? "",
    payoutFrequency: settings?.payoutFrequency ?? "",
    payoutValidationMode: settings?.payoutValidationMode ?? "",
    payoutCurrency: settings?.payoutCurrency ?? "",
    simulatorProviderFeePercent: settings?.simulatorProviderFeePercent ?? "",
  };
}

/**
 * Réglages du modèle économique (brief §4) : seuils et délais de retrait,
 * commission sur un retrait, fréquence, mode de validation, devise, et le
 * taux estimé utilisé par le simulateur ci-dessous. Les règles de commission
 * elles-mêmes restent sur l'écran « Commissions » — rien n'est dupliqué ici.
 *
 * Aucune valeur par défaut n'est inventée : un champ jamais renseigné reste
 * vide et signalé (brief §4), jusqu'à ce que le fondateur tranche.
 *
 * Le formulaire se synchronise sur les données chargées via l'option `values`
 * de react-hook-form (même pattern que `AuthorDetail`) plutôt qu'un
 * `useEffect` + `setState` manuel.
 */
export function EconomicSettingsManager() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "economic-settings"],
    queryFn: () => adminFetch<EconomicSettings>("/economic-settings"),
  });

  const { register, handleSubmit, watch, reset } = useForm<EconomicSettingsFormValues>({
    values: toFormValues(settings),
  });

  const save = useMutation({
    mutationFn: (values: EconomicSettingsFormValues) =>
      adminFetch<EconomicSettings>("/economic-settings", {
        method: "PUT",
        body: {
          ...(values.payoutMinThreshold !== "" && {
            payoutMinThreshold: values.payoutMinThreshold,
          }),
          ...(values.payoutDelayDays !== "" && {
            payoutDelayDays: Number(values.payoutDelayDays),
          }),
          ...(values.payoutFeePercent !== "" && {
            payoutFeePercent: values.payoutFeePercent,
          }),
          ...(values.payoutFrequency !== "" && {
            payoutFrequency: values.payoutFrequency,
          }),
          ...(values.payoutValidationMode !== "" && {
            payoutValidationMode: values.payoutValidationMode,
          }),
          ...(values.payoutCurrency !== "" && { payoutCurrency: values.payoutCurrency }),
          ...(values.simulatorProviderFeePercent !== "" && {
            simulatorProviderFeePercent: values.simulatorProviderFeePercent,
          }),
        },
      }),
    onSuccess: async (updated) => {
      setError(null);
      reset(toFormValues(updated));
      toast.success("Réglages enregistrés.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "economic-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "logs"] });
    },
    onError: (e: unknown) =>
      setError(e instanceof AdminApiError ? e.message : "Une erreur est survenue."),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settings && settings.undefinedKeys.length > 0 && (
        <div className="border-warning/40 bg-warning-muted text-warning flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            Pas encore défini :{" "}
            {settings.undefinedKeys.map((key) => FIELD_LABELS[key] ?? key).join(", ")}.
            Tant que ces réglages restent vides, aucune valeur par défaut n’est appliquée
            à leur place.
          </p>
        </div>
      )}

      <AdminPanel
        title="Retraits des auteurs"
        description="Paramètres appliqués aux demandes de retrait — voir aussi l'écran « Retraits »."
      >
        <form
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="space-y-5"
        >
          <FormError message={error ?? undefined} />

          <div className="grid gap-5 md:grid-cols-3">
            <Field
              id="payout-min-threshold"
              label="Seuil minimum de retrait (FCFA)"
              optional
              hint="Aucun seuil n'est imposé tant que ce champ est vide."
            >
              <Input
                inputMode="decimal"
                placeholder="Ex. 10000"
                {...register("payoutMinThreshold")}
              />
            </Field>

            <Field
              id="payout-delay-days"
              label="Délai avant disponibilité (jours)"
              optional
              hint="0 ou vide : disponible dès la vente."
            >
              <Input type="number" min={0} max={365} {...register("payoutDelayDays")} />
            </Field>

            <Field
              id="payout-fee-percent"
              label="Commission sur un retrait (%)"
              optional
              hint="Laisser vide si aucune commission n'est prélevée sur un retrait."
            >
              <Input
                inputMode="decimal"
                placeholder="Ex. 2"
                {...register("payoutFeePercent")}
              />
            </Field>

            <Field id="payout-frequency" label="Fréquence de traitement" optional>
              <Select {...register("payoutFrequency")}>
                <option value="">Non défini</option>
                <option value="manual">À la demande</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="biweekly">Toutes les deux semaines</option>
                <option value="monthly">Mensuelle</option>
              </Select>
            </Field>

            <Field id="payout-validation-mode" label="Validation des retraits" optional>
              <Select {...register("payoutValidationMode")}>
                <option value="">Non défini</option>
                <option value="manual">Manuelle (un administrateur approuve)</option>
                <option value="automatic">Automatique</option>
              </Select>
            </Field>

            <Field id="payout-currency" label="Devise" optional hint="Ex. XAF.">
              <Input placeholder="XAF" maxLength={3} {...register("payoutCurrency")} />
            </Field>
          </div>

          <Field
            id="simulator-provider-fee"
            label="Frais de paiement estimés pour le simulateur (%)"
            optional
            hint="Le frais réel n'est connu qu'à la transaction — cette valeur ne sert qu'au simulateur ci-dessous."
            className="md:w-72"
          >
            <Input
              inputMode="decimal"
              placeholder="Ex. 3"
              {...register("simulatorProviderFeePercent")}
            />
          </Field>

          <Button type="submit" isLoading={save.isPending}>
            {!save.isPending && <Save aria-hidden />}
            Enregistrer
          </Button>
        </form>
      </AdminPanel>

      <PriceSimulator defaultFeePercent={watch("simulatorProviderFeePercent")} />
    </div>
  );
}

/**
 * Simulateur prix → répartition. Calcul purement local : la commission
 * réelle dépend des règles configurées sur l'écran « Commissions » (portée
 * auteur/espace/type/globale) — reproduire cette sélection ici dupliquerait
 * une logique déjà correcte ailleurs. L'administrateur saisit le taux à
 * tester ; le simulateur ne fait que l'arithmétique.
 *
 * `key={defaultFeePercent}` (posé par l'appelant implicitement via ce même
 * prop) n'est pas nécessaire ici : le composant ne se remonte qu'une fois les
 * réglages chargés (le parent ne le rend qu'après `isLoading`), donc l'état
 * initial de `feePercent` est déjà la bonne valeur.
 */
function PriceSimulator({ defaultFeePercent }: { defaultFeePercent: string }) {
  const [price, setPrice] = useState("5000");
  const [feePercent, setFeePercent] = useState(defaultFeePercent);
  const [commissionPercent, setCommissionPercent] = useState("");

  const priceValue = Number(price) || 0;
  const feeValue = (priceValue * (Number(feePercent) || 0)) / 100;
  const netAfterFee = Math.max(priceValue - feeValue, 0);
  const commissionValue = (netAfterFee * (Number(commissionPercent) || 0)) / 100;
  const authorRevenue = Math.max(netAfterFee - commissionValue, 0);

  return (
    <AdminPanel
      title="Simulateur prix et revenus"
      description="Comprendre immédiatement combien reçoit chaque partie sur une vente."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="sim-price" label="Prix du livre (FCFA)">
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field id="sim-fee" label="Frais de paiement (%)">
          <Input
            inputMode="decimal"
            value={feePercent}
            onChange={(e) => setFeePercent(e.target.value)}
          />
        </Field>
        <Field id="sim-commission" label="Commission GeBook (%)">
          <Input
            inputMode="decimal"
            placeholder="Ex. 15"
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
          />
        </Field>
      </div>

      <div className="border-border mt-5 divide-y rounded-md border">
        <SimulatorRow label="Prix du livre" value={priceValue} />
        <SimulatorRow label="Frais de paiement" value={-feeValue} negative />
        <SimulatorRow label="Commission GeBook" value={-commissionValue} negative />
        <SimulatorRow label="Revenu auteur" value={authorRevenue} strong />
      </div>

      <p className="type-caption mt-3 flex items-center gap-1.5">
        <Calculator aria-hidden className="size-3.5" />
        Estimation à titre indicatif — la commission réellement appliquée dépend des
        règles actives sur l’écran « Commissions ».
      </p>
    </AdminPanel>
  );
}

function SimulatorRow({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: number;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className={strong ? "text-secondary font-semibold" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "text-secondary tnum text-base font-bold"
            : negative
              ? "tnum text-destructive"
              : "tnum text-secondary"
        }
      >
        {negative && value !== 0 ? "− " : ""}
        {Math.abs(Math.round(value)).toLocaleString("fr-FR")} FCFA
      </span>
    </div>
  );
}
