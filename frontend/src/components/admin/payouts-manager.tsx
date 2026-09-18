"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Send, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
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

interface Payout {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: string;
  currency: string;
  method: string;
  status: "pending" | "approved" | "processing" | "paid" | "failed" | "cancelled";
  beneficiaryName: string;
  beneficiaryCountry: string;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  failureReason: string | null;
}

interface PayoutBalance {
  availableBalance: string;
  currency: string;
  minThreshold: string | null;
  delayDays: number | null;
  belowThreshold: boolean;
}

const STATUS_LABELS: Record<Payout["status"], string> = {
  pending: "En attente",
  approved: "Approuvé",
  processing: "En cours",
  paid: "Payé",
  failed: "Échoué",
  cancelled: "Refusé",
};

const STATUS_TONES: Record<
  Payout["status"],
  "warning" | "success" | "neutral" | "danger"
> = {
  pending: "warning",
  approved: "neutral",
  processing: "neutral",
  paid: "success",
  failed: "danger",
  cancelled: "danger",
};

function amount(payout: { amount: string; currency: string }): string {
  return `${Number(payout.amount).toLocaleString("fr-FR")} ${payout.currency}`;
}

/**
 * Retraits — deux vues dans un seul écran (brief §1/§4) :
 * - un membre finance/owner/admin d'un espace y demande le retrait de son
 *   solde disponible ;
 * - un administrateur plateforme y approuve, refuse (avec motif) ou marque
 *   un retrait comme payé — mode manuel uniquement pour cette V1 (aucun
 *   virement n'est déclenché automatiquement par la plateforme).
 */
export function PayoutsManager({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  return isPlatformAdmin ? <PlatformPayoutsView /> : <TenantPayoutsView />;
}

function TenantPayoutsView() {
  const queryClient = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [form, setForm] = useState({
    beneficiaryName: "",
    beneficiaryCountry: "",
    beneficiaryAccount: "",
    method: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["admin", "tenant", "payouts", "balance"],
    queryFn: () => adminFetch<PayoutBalance>("/tenant/payouts/balance"),
  });

  const {
    data: payouts,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "tenant", "payouts"],
    queryFn: () => adminFetch<Payout[]>("/tenant/payouts"),
  });

  const request = useMutation({
    mutationFn: () =>
      adminFetch<Payout>("/tenant/payouts", { method: "POST", body: form }),
    onSuccess: async () => {
      setRequestOpen(false);
      setForm({
        beneficiaryName: "",
        beneficiaryCountry: "",
        beneficiaryAccount: "",
        method: "",
      });
      setError(null);
      toast.success("Demande de retrait envoyée.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tenant", "payouts"] });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "tenant", "payouts", "balance"],
      });
    },
    onError: (e: unknown) =>
      setError(e instanceof AdminApiError ? e.message : "Une erreur est survenue."),
  });

  return (
    <div className="space-y-6">
      <AdminStatGrid columns={2}>
        <AdminStatCard
          icon={Wallet}
          label="Solde disponible"
          value={
            balanceLoading
              ? "…"
              : amount({
                  amount: balance?.availableBalance ?? "0",
                  currency: balance?.currency ?? "XAF",
                })
          }
        />
      </AdminStatGrid>

      <AdminTablePanel
        title="Mes retraits"
        actions={
          <Button
            type="button"
            size="sm"
            disabled={
              !balance || Number(balance.availableBalance) <= 0 || balance.belowThreshold
            }
            onClick={() => setRequestOpen(true)}
          >
            <Send aria-hidden />
            Demander un retrait
          </Button>
        }
      >
        {balance?.belowThreshold && (
          <p className="type-caption text-warning px-5 pt-4 pb-1">
            Le solde disponible est sous le seuil minimum de retrait (
            {amount({ amount: balance.minThreshold ?? "0", currency: balance.currency })}
            ).
          </p>
        )}

        {isLoading && <TableSkeleton rows={3} columns={4} />}
        {isError && <RetryRow onRetry={() => refetch()} label="retraits" />}

        {!isLoading && !isError && (
          <DataTable
            caption="Mes demandes de retrait"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">Montant</th>
                <th scope="col">Statut</th>
                <th scope="col">Demandé le</th>
                <th scope="col">Motif</th>
              </>
            }
          >
            {payouts?.length === 0 ? (
              <DataRowFull colSpan={4}>
                Aucune demande de retrait pour le moment.
              </DataRowFull>
            ) : (
              payouts?.map((payout) => (
                <DataRow key={payout.id}>
                  <td className="tnum text-secondary font-medium">{amount(payout)}</td>
                  <td>
                    <Badge variant={STATUS_TONES[payout.status]}>
                      {STATUS_LABELS[payout.status]}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(payout.requestedAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="text-muted-foreground">{payout.failureReason ?? "—"}</td>
                </DataRow>
              ))
            )}
          </DataTable>
        )}
      </AdminTablePanel>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demander un retrait</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              request.mutate();
            }}
          >
            <DialogBody className="space-y-4">
              <FormError message={error ?? undefined} />
              <p className="text-muted-foreground text-sm">
                L’intégralité du solde disponible (
                {amount({
                  amount: balance?.availableBalance ?? "0",
                  currency: balance?.currency ?? "XAF",
                })}
                ) sera demandée.
              </p>
              <Field id="beneficiary-name" label="Nom du bénéficiaire" required>
                <Input
                  value={form.beneficiaryName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, beneficiaryName: e.target.value }))
                  }
                  required
                />
              </Field>
              <Field id="beneficiary-country" label="Pays" required>
                <Input
                  value={form.beneficiaryCountry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, beneficiaryCountry: e.target.value }))
                  }
                  required
                />
              </Field>
              <Field
                id="beneficiary-method"
                label="Moyen de retrait"
                required
                hint="Ex. Mobile Money, virement bancaire."
              >
                <Input
                  value={form.method}
                  onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                  required
                />
              </Field>
              <Field id="beneficiary-account" label="Numéro / coordonnées" required>
                <Input
                  value={form.beneficiaryAccount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, beneficiaryAccount: e.target.value }))
                  }
                  required
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRequestOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" isLoading={request.isPending}>
                Envoyer la demande
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlatformPayoutsView() {
  const queryClient = useQueryClient();
  const [toReject, setToReject] = useState<Payout | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const {
    data: payouts,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: () => adminFetch<Payout[]>("/payouts"),
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] });

  const approve = useMutation({
    mutationFn: (id: string) =>
      adminFetch<Payout>(`/payouts/${id}/approve`, { method: "PATCH" }),
    onSuccess: async () => {
      toast.success("Retrait approuvé.");
      await invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof AdminApiError ? e.message : "Une erreur est survenue."),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      adminFetch<Payout>(`/payouts/${id}/mark-paid`, { method: "PATCH", body: {} }),
    onSuccess: async () => {
      toast.success("Retrait marqué comme payé.");
      await invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof AdminApiError ? e.message : "Une erreur est survenue."),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch<Payout>(`/payouts/${id}/reject`, { method: "PATCH", body: { reason } }),
    onSuccess: async () => {
      setToReject(null);
      setRejectReason("");
      toast.success("Retrait refusé.");
      await invalidate();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof AdminApiError ? e.message : "Une erreur est survenue.");
    },
  });

  const pendingCount = payouts?.filter((p) => p.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <AdminStatGrid columns={2}>
        <AdminStatCard
          icon={Wallet}
          label="Demandes en attente"
          value={String(pendingCount)}
        />
      </AdminStatGrid>

      <AdminTablePanel title="Toutes les demandes de retrait">
        {isLoading && <TableSkeleton rows={4} columns={6} />}
        {isError && <RetryRow onRetry={() => refetch()} label="retraits" />}

        {!isLoading && !isError && (
          <DataTable
            caption="Demandes de retrait"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">Espace</th>
                <th scope="col">Montant</th>
                <th scope="col">Bénéficiaire</th>
                <th scope="col">Statut</th>
                <th scope="col">Demandé le</th>
                <th scope="col" className="text-right!">
                  Actions
                </th>
              </>
            }
          >
            {payouts?.length === 0 ? (
              <DataRowFull colSpan={6}>Aucune demande de retrait.</DataRowFull>
            ) : (
              payouts?.map((payout) => (
                <DataRow key={payout.id}>
                  <td className="text-secondary font-medium">{payout.tenantName}</td>
                  <td className="tnum text-secondary">{amount(payout)}</td>
                  <td className="text-muted-foreground">
                    {payout.beneficiaryName} · {payout.beneficiaryCountry}
                  </td>
                  <td>
                    <Badge variant={STATUS_TONES[payout.status]}>
                      {STATUS_LABELS[payout.status]}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(payout.requestedAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      {payout.status === "pending" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isLoading={approve.isPending}
                            onClick={() => approve.mutate(payout.id)}
                          >
                            <CheckCircle2 aria-hidden />
                            Approuver
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setToReject(payout)}
                          >
                            <XCircle aria-hidden />
                            Refuser
                          </Button>
                        </>
                      )}
                      {payout.status === "approved" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            isLoading={markPaid.isPending}
                            onClick={() => markPaid.mutate(payout.id)}
                          >
                            Marquer payé
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setToReject(payout)}
                          >
                            <XCircle aria-hidden />
                            Refuser
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </DataRow>
              ))
            )}
          </DataTable>
        )}
      </AdminTablePanel>

      <Dialog
        open={toReject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToReject(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser ce retrait ?</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (toReject) reject.mutate({ id: toReject.id, reason: rejectReason });
            }}
          >
            <DialogBody className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {toReject &&
                  `Le retrait de ${amount(toReject)} demandé par « ${toReject.tenantName} » sera refusé. Les ventes concernées redeviennent disponibles pour une prochaine demande.`}
              </p>
              <Field id="reject-reason" label="Motif du refus" required>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setToReject(null);
                  setRejectReason("");
                }}
              >
                Annuler
              </Button>
              <Button type="submit" variant="destructive" isLoading={reject.isPending}>
                Refuser le retrait
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
