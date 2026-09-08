"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CircleAlert,
  PlugZap,
  Power,
  PowerOff,
  Settings,
  Star,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { DataTableActionMenu } from "@/src/components/admin/data-table-action-menu";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";

interface CredentialFieldState {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  hasValue: boolean;
}

interface AdminPaymentProvider {
  code: string;
  name: string;
  environment: "sandbox" | "production";
  status: "active" | "inactive";
  supportsMobileMoney: boolean;
  supportsCard: boolean;
  supportsRefund: boolean;
  supportsPayout: boolean;
  priority: number;
  payinDriverInstalled: boolean;
  payoutDriverInstalled: boolean;
  configured: boolean;
  missingFields: string[];
  credentialFields: CredentialFieldState[];
  isDefault: boolean;
}

interface ConnectionTestResult {
  ok: boolean;
  detail: string;
}

interface ConnectionTestResponse {
  code: string;
  payin: ConnectionTestResult | null;
  payout: ConnectionTestResult | null;
}

interface CapabilitiesState {
  supportsMobileMoney: boolean;
  supportsCard: boolean;
  supportsRefund: boolean;
  supportsPayout: boolean;
  priority: number;
}

function capabilitiesOf(provider: AdminPaymentProvider): CapabilitiesState {
  return {
    supportsMobileMoney: provider.supportsMobileMoney,
    supportsCard: provider.supportsCard,
    supportsRefund: provider.supportsRefund,
    supportsPayout: provider.supportsPayout,
    priority: provider.priority,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof AdminApiError
    ? error.message
    : "Une erreur est survenue. Veuillez réessayer.";
}

/**
 * Superadmin → Paramètres → Paiements.
 *
 * Les identifiants (URL d'API, clés, jetons) se saisissent désormais depuis
 * cette page — chiffrés en base (`EncryptionService`, AES-256-GCM) — plutôt
 * que dans `.env` du serveur : plus besoin d'un redéploiement pour faire
 * pivoter une clé. `credentialFields` ne porte jamais la valeur réelle, que
 * ce champ soit renseigné ou non (`hasValue`) : le formulaire « Configurer »
 * n'affiche donc jamais un identifiant existant, seulement s'il est présent —
 * un champ laissé vide à l'enregistrement conserve la valeur déjà en place.
 *
 * `status` (actif/inactif) reste immédiat, sans passer par le formulaire :
 * `PaymentsService#resolveProvider` relit cette colonne à chaque paiement.
 */
export function PaymentProvidersManager() {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResponse>>(
    {},
  );
  const [configuring, setConfiguring] = useState<AdminPaymentProvider | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<CapabilitiesState | null>(null);
  const [configError, setConfigError] = useState<string | undefined>();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "payment-providers"],
    queryFn: () => adminFetch<AdminPaymentProvider[]>("/payment-providers"),
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "payment-providers"] });

  const statusMutation = useMutation({
    mutationFn: ({ code, status }: { code: string; status: "active" | "inactive" }) =>
      adminFetch<AdminPaymentProvider>(`/payment-providers/${code}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: async (provider) => {
      toast.success(
        `${provider.name} : ${provider.status === "active" ? "activé" : "désactivé"}.`,
      );
      await invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const testMutation = useMutation({
    mutationFn: (code: string) =>
      adminFetch<ConnectionTestResponse>(`/payment-providers/${code}/test-connection`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      setTestResults((current) => ({ ...current, [result.code]: result }));
      const overallOk = result.payin?.ok && (result.payout === null || result.payout.ok);
      if (overallOk) {
        toast.success(`${result.code} : connexion réussie.`);
      } else {
        toast.error(`${result.code} : échec de connexion — voir le détail.`);
      }
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const configurationMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      adminFetch<AdminPaymentProvider>(
        `/payment-providers/${configuring?.code}/configuration`,
        { method: "PUT", body: payload },
      ),
    onSuccess: async (provider) => {
      toast.success(`${provider.name} : configuration enregistrée.`);
      setConfiguring(null);
      setConfigError(undefined);
      await invalidate();
    },
    onError: (error: unknown) => setConfigError(errorMessage(error)),
  });

  const defaultMutation = useMutation({
    mutationFn: (code: string) =>
      adminFetch<AdminPaymentProvider>(`/payment-providers/${code}/default`, {
        method: "PUT",
      }),
    onSuccess: async (provider) => {
      toast.success(`${provider.name} est désormais le prestataire par défaut.`);
      await invalidate();
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  });

  const openConfigure = (provider: AdminPaymentProvider): void => {
    setConfiguring(provider);
    setCredentialValues({});
    setCapabilities(capabilitiesOf(provider));
    setConfigError(undefined);
  };

  const submitConfiguration = (): void => {
    if (!configuring || !capabilities) return;
    const credentials = Object.fromEntries(
      Object.entries(credentialValues).filter(([, value]) => value.trim().length > 0),
    );
    configurationMutation.mutate({
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
      ...capabilities,
    });
  };

  const providers = data ?? [];
  const activeCount = providers.filter((p) => p.status === "active").length;
  const configuredCount = providers.filter((p) => p.configured).length;
  const productionCount = providers.filter((p) => p.environment === "production").length;

  return (
    <div className="space-y-6">
      <AdminStatGrid columns={4}>
        <AdminStatCard label="Prestataires" value={providers.length} icon={Wallet} />
        <AdminStatCard label="Actifs" value={activeCount} icon={CheckCircle2} />
        <AdminStatCard
          label="Configurés"
          value={configuredCount}
          hint={
            providers.length - configuredCount > 0
              ? `${providers.length - configuredCount} sans identifiants`
              : undefined
          }
          icon={PlugZap}
        />
        <AdminStatCard
          label="En production"
          value={productionCount}
          hint={
            productionCount === 0
              ? "Tout est en sandbox"
              : "Vérifiez avant toute activation"
          }
          icon={CircleAlert}
        />
      </AdminStatGrid>

      <AdminTablePanel
        title="Prestataires de paiement et de reversement"
        description="Le pay-in (encaissement) et le payout (reversement) sont deux capacités indépendantes : un même prestataire peut n'offrir que l'une des deux."
      >
        {isLoading && <TableSkeleton rows={4} columns={7} />}
        {isError && <RetryRow onRetry={() => void refetch()} label="prestataires" />}

        {!isLoading && !isError && (
          <DataTable
            caption="Prestataires de paiement"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">Prestataire</th>
                <th scope="col">Environnement</th>
                <th scope="col">Statut</th>
                <th scope="col">Pay-in</th>
                <th scope="col">Payout</th>
                <th scope="col">Configuration</th>
                <th scope="col" className="text-right!">
                  Actions
                </th>
              </>
            }
          >
            {providers.length === 0 ? (
              <DataRowFull colSpan={7}>Aucun prestataire enregistré.</DataRowFull>
            ) : (
              providers.map((provider) => {
                const result = testResults[provider.code];
                return (
                  <DataRow key={provider.code}>
                    <td>
                      <span className="text-secondary flex items-center gap-1.5 font-medium">
                        {provider.name}
                        {provider.isDefault && (
                          <Star
                            aria-label="Prestataire par défaut"
                            className="text-gold-500 size-3.5 fill-current"
                          />
                        )}
                      </span>
                      <span className="type-caption block">{provider.code}</span>
                    </td>
                    <td>
                      <Badge
                        variant={
                          provider.environment === "production" ? "danger" : "info"
                        }
                      >
                        {provider.environment === "production" ? "PRODUCTION" : "SANDBOX"}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={provider.status === "active" ? "success" : "neutral"}
                      >
                        {provider.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td>
                      <DriverBadge
                        installed={provider.payinDriverInstalled}
                        icon={ArrowDownToLine}
                      />
                    </td>
                    <td>
                      {provider.supportsPayout ? (
                        <DriverBadge
                          installed={provider.payoutDriverInstalled}
                          icon={ArrowUpFromLine}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Non applicable
                        </span>
                      )}
                    </td>
                    <td>
                      {provider.configured ? (
                        <Badge variant="success">Configuré</Badge>
                      ) : (
                        <div>
                          <Badge variant="warning">Incomplet</Badge>
                          {provider.missingFields.length > 0 && (
                            <span className="type-caption mt-1 block max-w-48">
                              Manque : {provider.missingFields.join(", ")}
                            </span>
                          )}
                        </div>
                      )}
                      {result && (
                        <div className="mt-1.5 max-w-48">
                          <p
                            className={
                              result.payin?.ok
                                ? "text-success text-xs"
                                : "text-destructive text-xs"
                            }
                          >
                            Pay-in : {result.payin?.detail}
                          </p>
                          {result.payout && (
                            <p
                              className={
                                result.payout.ok
                                  ? "text-success text-xs"
                                  : "text-destructive text-xs"
                              }
                            >
                              Payout : {result.payout.detail}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <DataTableActionMenu
                          triggerLabel={`Actions — ${provider.name}`}
                          actions={[
                            {
                              label: "Configurer",
                              icon: Settings,
                              onSelect: () => openConfigure(provider),
                            },
                            {
                              label:
                                provider.status === "active" ? "Désactiver" : "Activer",
                              icon: provider.status === "active" ? PowerOff : Power,
                              onSelect: () =>
                                statusMutation.mutate({
                                  code: provider.code,
                                  status:
                                    provider.status === "active" ? "inactive" : "active",
                                }),
                            },
                            {
                              label: "Définir par défaut",
                              icon: Star,
                              disabled: provider.isDefault,
                              onSelect: () => defaultMutation.mutate(provider.code),
                            },
                            { type: "separator" },
                            {
                              label: "Tester la connexion",
                              icon: PlugZap,
                              onSelect: () => testMutation.mutate(provider.code),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </DataRow>
                );
              })
            )}
          </DataTable>
        )}
      </AdminTablePanel>

      <p className="type-caption max-w-2xl">
        Les identifiants (URL d’API, clés, jetons) sont chiffrés en base et modifiables à
        tout moment depuis « Configurer », sans redéploiement — une variable
        d’environnement du serveur reste un repli tant qu’aucune valeur n’a été
        enregistrée ici.
      </p>

      <Dialog
        open={configuring !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfiguring(null);
            setConfigError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {configuring ? `Configurer ${configuring.name}` : "Configurer"}
            </DialogTitle>
          </DialogHeader>

          {configuring && capabilities && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitConfiguration();
              }}
            >
              <DialogBody className="grid gap-5">
                <FormError message={configError} />

                {configuring.credentialFields.length > 0 && (
                  <div className="grid gap-4">
                    <h3 className="text-secondary text-sm font-semibold">Identifiants</h3>
                    {configuring.credentialFields.map((field) => (
                      <Field
                        key={field.key}
                        id={`cred-${field.key}`}
                        label={field.label}
                        required={field.required}
                        hint={
                          field.hasValue
                            ? "Une valeur est déjà enregistrée — laissez vide pour la conserver."
                            : undefined
                        }
                      >
                        <Input
                          type={field.secret ? "password" : "text"}
                          autoComplete="off"
                          placeholder={field.hasValue ? "•••••••• (inchangé)" : undefined}
                          value={credentialValues[field.key] ?? ""}
                          onChange={(event) =>
                            setCredentialValues((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    ))}
                  </div>
                )}

                <div className="grid gap-3">
                  <h3 className="text-secondary text-sm font-semibold">Disponibilité</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CapabilityCheckbox
                      label="Mobile money"
                      checked={capabilities.supportsMobileMoney}
                      onChange={(checked) =>
                        setCapabilities((current) =>
                          current
                            ? { ...current, supportsMobileMoney: checked }
                            : current,
                        )
                      }
                    />
                    <CapabilityCheckbox
                      label="Carte bancaire"
                      checked={capabilities.supportsCard}
                      onChange={(checked) =>
                        setCapabilities((current) =>
                          current ? { ...current, supportsCard: checked } : current,
                        )
                      }
                    />
                    <CapabilityCheckbox
                      label="Remboursement"
                      checked={capabilities.supportsRefund}
                      onChange={(checked) =>
                        setCapabilities((current) =>
                          current ? { ...current, supportsRefund: checked } : current,
                        )
                      }
                    />
                    <CapabilityCheckbox
                      label="Reversement (payout)"
                      checked={capabilities.supportsPayout}
                      onChange={(checked) =>
                        setCapabilities((current) =>
                          current ? { ...current, supportsPayout: checked } : current,
                        )
                      }
                    />
                  </div>

                  <Field
                    id="cfg-priority"
                    label="Priorité"
                    hint="Plus la valeur est basse, plus le prestataire est prioritaire."
                  >
                    <Input
                      type="number"
                      min={1}
                      value={capabilities.priority}
                      onChange={(event) =>
                        setCapabilities((current) =>
                          current
                            ? { ...current, priority: Number(event.target.value) || 1 }
                            : current,
                        )
                      }
                    />
                  </Field>
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfiguring(null)}
                >
                  Annuler
                </Button>
                <Button type="submit" isLoading={configurationMutation.isPending}>
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DriverBadge({
  installed,
  icon: Icon,
}: {
  installed: boolean;
  icon: typeof ArrowDownToLine;
}) {
  return (
    <Badge variant={installed ? "success" : "neutral"} className="gap-1">
      <Icon aria-hidden className="size-3" />
      {installed ? "Installé" : "Non installé"}
    </Badge>
  );
}

function CapabilityCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary size-4 cursor-pointer"
      />
      {label}
    </label>
  );
}
