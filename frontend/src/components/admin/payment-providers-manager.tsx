"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CircleAlert,
  PlugZap,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataRow, DataRowFull, DataTable } from "@/src/components/ui/data-table";
import { RetryRow, TableSkeleton } from "@/src/components/ui/states";
import { AdminApiError, adminFetch } from "@/src/lib/admin-api";

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
  missingEnvVars: string[];
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

/**
 * Superadmin → Paramètres → Paiements (mission plateforme de paiement, Phase 2).
 *
 * Lecture seule pour tout ce qui est dérivé de l'environnement : les secrets
 * des prestataires (PawaPay, CinetPay, FeexPay) ne vivent que dans la
 * configuration serveur (`.env`), jamais en base — cette page ne fait donc
 * que refléter ce que le serveur voit (variable présente ou non, pilote
 * installé ou non), jamais les valeurs elles-mêmes. « Tester la connexion »
 * appelle un vrai test côté serveur ; un prestataire sans pilote installé le
 * dit explicitement plutôt que de fabriquer un succès.
 *
 * `status` (actif/inactif) fait exception : ce n'est pas un secret, c'est
 * une colonne ordinaire que `PaymentsService#resolveProvider` relit à chaque
 * paiement — la case à cocher de la colonne « Statut » la change directement,
 * sans redémarrage ni variable d'environnement à toucher.
 */
export function PaymentProvidersManager() {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResponse>>(
    {},
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "payment-providers"],
    queryFn: () => adminFetch<AdminPaymentProvider[]>("/payment-providers"),
  });

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
      await queryClient.invalidateQueries({ queryKey: ["admin", "payment-providers"] });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof AdminApiError
          ? error.message
          : "Une erreur est survenue. Veuillez réessayer.",
      );
    },
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
    onError: (error: unknown) => {
      toast.error(
        error instanceof AdminApiError
          ? error.message
          : "Une erreur est survenue. Veuillez réessayer.",
      );
    },
  });

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
        {isLoading && <TableSkeleton rows={4} columns={6} />}
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
                  Connexion
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
                      <span className="text-secondary font-medium">{provider.name}</span>
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
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={provider.status === "active"}
                          disabled={
                            statusMutation.isPending &&
                            statusMutation.variables?.code === provider.code
                          }
                          onChange={(event) =>
                            statusMutation.mutate({
                              code: provider.code,
                              status: event.target.checked ? "active" : "inactive",
                            })
                          }
                          className="accent-primary size-4 cursor-pointer"
                        />
                        <Badge
                          variant={provider.status === "active" ? "success" : "neutral"}
                        >
                          {provider.status === "active" ? "Actif" : "Inactif"}
                        </Badge>
                      </label>
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
                          <span className="type-caption mt-1 block max-w-48">
                            Manque : {provider.missingEnvVars.join(", ")}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col items-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          isLoading={
                            testMutation.isPending &&
                            testMutation.variables === provider.code
                          }
                          onClick={() => testMutation.mutate(provider.code)}
                        >
                          <PlugZap aria-hidden />
                          Tester la connexion
                        </Button>
                        {result && (
                          <div className="max-w-56 text-right">
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
        Les identifiants réels (URL d’API, clé, jeton) se configurent exclusivement via
        les variables d’environnement du serveur — jamais depuis cette page. Le statut
        actif/inactif, lui, se change ici à tout moment, sans reconfiguration : un
        prestataire désactivé n’est plus proposé au règlement dès ce changement,
        immédiatement.
      </p>
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
