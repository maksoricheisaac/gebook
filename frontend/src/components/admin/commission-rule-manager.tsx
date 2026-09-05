"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  CheckCircle2,
  Filter,
  Percent,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserSquare2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminStatCard,
  AdminStatGrid,
  AdminTablePanel,
} from "@/src/components/admin/admin-page";
import { ConfirmDialog } from "@/src/components/admin/confirm-dialog";
import { IdCell } from "@/src/components/admin/id-cell";
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
import { formatDate } from "@/src/lib/format";

type TenantType =
  "independent_author" | "publishing_house" | "collective" | "cultural_organization";

interface CommissionRule {
  id: string;
  name: string;
  authorId: string | null;
  author: { penName: string } | null;
  tenantId: string | null;
  tenant: { name: string } | null;
  tenantType: TenantType | null;
  commissionType: "percentage" | "fixed";
  commissionValue: string;
  calculationBase: "gross_amount" | "after_provider_fee";
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "inactive";
}

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
}

interface Paginated<T> {
  data: T[];
  meta: { total: number };
}

const EMPTY_RULES: CommissionRule[] = [];
const EMPTY_TENANTS: AdminTenant[] = [];

/** Portées créables depuis cette interface. `author` existe en base (règles
 * historiques, créées ailleurs) mais ne peut pas être choisie ici — aucun
 * sélecteur d'auteur global n'existe côté Superadmin (hors périmètre de
 * cette mission) ; une règle propre à un auteur reste affichée et modifiable
 * sur ses autres champs, seule sa portée n'est pas éditable depuis ce form. */
const CREATABLE_SCOPES = ["global", "tenant", "tenant_type"] as const;
type Scope = (typeof CREATABLE_SCOPES)[number] | "author";

const TENANT_TYPE_LABELS: Record<TenantType, string> = {
  independent_author: "Auteur indépendant",
  publishing_house: "Maison d'édition",
  collective: "Collectif",
  cultural_organization: "Organisation culturelle",
};

const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire.").max(150),
    scope: z.enum(CREATABLE_SCOPES),
    tenantId: z.string().optional(),
    tenantType: z
      .enum([
        "independent_author",
        "publishing_house",
        "collective",
        "cultural_organization",
      ])
      .optional(),
    commissionType: z.enum(["percentage", "fixed"]),
    commissionValue: z
      .string()
      .trim()
      .regex(/^\d{1,8}(\.\d{1,4})?$/, "Nombre positif, quatre décimales maximum."),
    calculationBase: z.enum(["gross_amount", "after_provider_fee"]),
    effectiveFrom: z.string().min(1, "La date d’entrée en vigueur est obligatoire."),
    status: z.enum(["active", "inactive"]),
  })
  // Le plafond ne vaut que pour un pourcentage : une commission fixe peut valoir
  // n'importe quel montant. Même règle que la contrainte CHECK de la base.
  .refine(
    (values) =>
      values.commissionType !== "percentage" || Number(values.commissionValue) <= 100,
    {
      path: ["commissionValue"],
      message: "Un pourcentage ne peut pas dépasser 100 %.",
    },
  )
  .refine((values) => values.scope !== "tenant" || Boolean(values.tenantId), {
    path: ["tenantId"],
    message: "Choisissez un tenant.",
  })
  .refine((values) => values.scope !== "tenant_type" || Boolean(values.tenantType), {
    path: ["tenantType"],
    message: "Choisissez un type de tenant.",
  });

type RuleFormValues = z.infer<typeof ruleSchema>;

const EMPTY: RuleFormValues = {
  name: "",
  scope: "global",
  commissionType: "percentage",
  commissionValue: "10",
  calculationBase: "after_provider_fee",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  status: "active",
};

const BASE_LABELS: Record<string, string> = {
  gross_amount: "Montant brut",
  after_provider_fee: "Net après frais",
};

function scopeOf(rule: CommissionRule): Scope {
  if (rule.authorId) return "author";
  if (rule.tenantId) return "tenant";
  if (rule.tenantType) return "tenant_type";
  return "global";
}

function scopeDetail(rule: CommissionRule): string {
  switch (scopeOf(rule)) {
    case "author":
      return rule.author ? `Propre à ${rule.author.penName}` : "Propre à un auteur";
    case "tenant":
      return rule.tenant ? `Propre à ${rule.tenant.name}` : "Propre à un tenant";
    case "tenant_type":
      return rule.tenantType ? TENANT_TYPE_LABELS[rule.tenantType] : "Type de tenant";
    default:
      return "Règle générale";
  }
}

/**
 * Administration des règles de commission.
 *
 * La modification et la suppression n'affectent **que les ventes futures** :
 * les répartitions déjà figées conservent leurs montants (règles n° 13 et 14).
 * L'interface le dit explicitement, parce que c'est exactement le point sur
 * lequel un administrateur peut se tromper — croire qu'il corrige le passé.
 */
export function CommissionRuleManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CommissionRule | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "commission-rules"],
    queryFn: () => adminFetch<Paginated<CommissionRule>>("/commission-rules?perPage=100"),
  });

  // Répertoire des tenants pour le sélecteur de portée « Tenant » — au plus
  // 100 lignes (`AdminTenantsController`), pas de recherche serveur nécessaire
  // à cette échelle.
  const { data: tenantsData } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: () => adminFetch<AdminTenant[]>("/tenants"),
  });
  const tenants = tenantsData ?? EMPTY_TENANTS;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: EMPTY,
  });
  const selectedScope = watch("scope");
  const isEditingAuthorRule = editing !== null && editing.authorId !== null;

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ["admin", "commission-rules"] });

  /** Traduit la portée choisie dans le formulaire vers les champs attendus
   * par l'API (`tenantId`/`tenantType` mutuellement exclusifs, jamais les
   * deux — `AdminCommissionRulesService.assertScope`).
   *
   * En modification, le champ non choisi doit être envoyé à `null`
   * explicitement (pas omis) pour pouvoir faire repasser une règle de
   * « propre au tenant » à « générale » — `undefined` signifie « ne pas
   * toucher » côté API (`UpdateCommissionRuleDto`), ce qui laisserait
   * l'ancienne portée en place. En création, rien n'existe encore à effacer :
   * les deux champs restent simplement absents. */
  const scopeFields = (
    values: RuleFormValues,
    mode: "create" | "update",
  ): { tenantId?: string | null; tenantType?: RuleFormValues["tenantType"] | null } => {
    const clear = mode === "update" ? null : undefined;
    return {
      tenantId: values.scope === "tenant" ? values.tenantId : clear,
      tenantType: values.scope === "tenant_type" ? values.tenantType : clear,
    };
  };

  const createMutation = useMutation({
    mutationFn: (values: RuleFormValues) =>
      adminFetch<CommissionRule>("/commission-rules", {
        method: "POST",
        body: {
          name: values.name,
          ...scopeFields(values, "create"),
          commissionType: values.commissionType,
          commissionValue: values.commissionValue,
          calculationBase: values.calculationBase,
          effectiveFrom: new Date(values.effectiveFrom).toISOString(),
          status: values.status,
        },
      }),
    onSuccess: async (rule) => {
      reset(EMPTY);
      setServerError(null);
      setIsFormOpen(false);
      toast.success(`Règle « ${rule.name} » créée.`);
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (values: RuleFormValues & { id: string }) =>
      adminFetch<CommissionRule>(`/commission-rules/${values.id}`, {
        method: "PATCH",
        body: {
          name: values.name,
          // Une règle déjà propre à un auteur ne peut pas changer de portée
          // depuis ce formulaire (aucun sélecteur d'auteur global côté
          // Superadmin) : `tenantId`/`tenantType` restent intouchés plutôt
          // que forcés à `null`, ce qui violerait sinon
          // `chk_commission_rules_scope` sans raison (ils sont déjà nuls).
          ...(editing?.authorId ? {} : scopeFields(values, "update")),
          commissionType: values.commissionType,
          commissionValue: values.commissionValue,
          calculationBase: values.calculationBase,
          effectiveFrom: new Date(values.effectiveFrom).toISOString(),
          status: values.status,
        },
      }),
    onSuccess: async (rule) => {
      setEditing(null);
      reset(EMPTY);
      setServerError(null);
      setIsFormOpen(false);
      toast.success(`Règle « ${rule.name} » modifiée.`);
      await invalidate();
    },
    onError: (error: unknown) => setServerError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch<void>(`/commission-rules/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      const name = toDelete?.name;
      setToDelete(null);
      setServerError(null);
      toast.success(name ? `Règle « ${name} » supprimée.` : "Règle supprimée.");
      await invalidate();
    },
    onError: (error: unknown) => {
      setToDelete(null);
      toast.error(errorMessage(error));
    },
  });

  const startCreate = (): void => {
    setEditing(null);
    setServerError(null);
    reset(EMPTY);
    setIsFormOpen(true);
  };

  const startEdit = (rule: CommissionRule): void => {
    setEditing(rule);
    setServerError(null);
    reset({
      name: rule.name,
      // `author` n'est pas une portée sélectionnable ici (voir
      // `CREATABLE_SCOPES`) : affichée comme « générale » dans le formulaire,
      // mais `editing.authorId` (conservé) empêche le sélecteur de portée de
      // s'afficher et empêche la mutation de toucher tenantId/tenantType.
      scope: rule.tenantId ? "tenant" : rule.tenantType ? "tenant_type" : "global",
      tenantId: rule.tenantId ?? undefined,
      tenantType: rule.tenantType ?? undefined,
      commissionType: rule.commissionType,
      commissionValue: rule.commissionValue,
      calculationBase: rule.calculationBase,
      effectiveFrom: rule.effectiveFrom.slice(0, 10),
      status: rule.status,
    });
    setIsFormOpen(true);
  };

  const rules = data?.data ?? EMPTY_RULES;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rules;
    return rules.filter((rule) => rule.name.toLowerCase().includes(query));
  }, [rules, search]);

  const activeCount = rules.filter((rule) => rule.status === "active").length;
  const generalCount = rules.filter((rule) => scopeOf(rule) === "global").length;
  const scopedCount = rules.length - generalCount;

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard
          label="Règles"
          value={data?.meta.total ?? rules.length}
          icon={Percent}
        />
        <AdminStatCard label="Actives" value={activeCount} icon={CheckCircle2} />
        <AdminStatCard label="Générales" value={generalCount} icon={UserSquare2} />
        <AdminStatCard
          label="À portée réduite"
          value={scopedCount}
          hint="Limitées à un espace ou un type d’espace"
          icon={Filter}
        />
      </AdminStatGrid>

      <AdminTablePanel
        title="Règles en place"
        description="Modifier ou supprimer une règle ne change aucune vente déjà conclue : les montants sont figés au moment du paiement."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full pl-8 sm:w-48"
                aria-label="Rechercher une règle"
              />
            </div>
            <Button type="button" size="sm" onClick={startCreate}>
              <Plus aria-hidden />
              Nouvelle règle
            </Button>
          </div>
        }
      >
        {isLoading && <TableSkeleton rows={3} columns={6} />}
        {isError && <RetryRow onRetry={() => void refetch()} label="règles" />}

        {!isLoading && !isError && (
          <DataTable
            caption="Règles de commission"
            className="rounded-none border-0"
            head={
              <>
                <th scope="col">#</th>
                <th scope="col">Règle</th>
                <th scope="col">Taux</th>
                <th scope="col">Base de calcul</th>
                <th scope="col">En vigueur</th>
                <th scope="col" className="text-right!">
                  Actions
                </th>
              </>
            }
          >
            {filtered.length === 0 ? (
              <DataRowFull colSpan={6}>
                {search
                  ? "Aucune règle ne correspond à cette recherche."
                  : "Aucune règle de commission pour le moment."}
              </DataRowFull>
            ) : (
              filtered.map((rule) => (
                <DataRow key={rule.id}>
                  <td>
                    <IdCell id={rule.id} />
                  </td>
                  <td>
                    <span className="text-secondary font-medium">{rule.name}</span>
                    <span className="type-caption block">{scopeDetail(rule)}</span>
                  </td>
                  <td className="tnum text-secondary">
                    {rule.commissionType === "percentage"
                      ? `${Number(rule.commissionValue)} %`
                      : `${Number(rule.commissionValue)} FCFA / ex.`}
                  </td>
                  <td className="text-muted-foreground">
                    {BASE_LABELS[rule.calculationBase]}
                  </td>
                  <td className="text-muted-foreground">
                    {formatDate(rule.effectiveFrom)}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge variant={rule.status === "active" ? "success" : "neutral"}>
                        {rule.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(rule)}
                        aria-label={`Modifier la règle ${rule.name}`}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(rule)}
                        aria-label={`Supprimer la règle ${rule.name}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </td>
                </DataRow>
              ))
            )}
          </DataTable>
        )}
      </AdminTablePanel>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditing(null);
            setServerError(null);
            reset(EMPTY);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Modifier « ${editing.name} »` : "Nouvelle règle"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((values) =>
              editing
                ? updateMutation.mutate({ ...values, id: editing.id })
                : createMutation.mutate(values),
            )}
          >
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormError message={serverError ?? undefined} />
              </div>

              <Field
                id="rule-name"
                label="Nom"
                required
                error={errors.name?.message}
                className="sm:col-span-2"
              >
                <Input {...register("name")} placeholder="Commission générale 2026" />
              </Field>

              {isEditingAuthorRule ? (
                <div className="border-border bg-paper-100/70 type-caption rounded-md border p-3 sm:col-span-2">
                  Portée : propre à {editing?.author?.penName ?? "un auteur"} — non
                  modifiable depuis cette page (aucun sélecteur d’auteur global ici).
                </div>
              ) : (
                <>
                  <Field
                    id="rule-scope"
                    label="Portée"
                    required
                    error={errors.scope?.message}
                    className="sm:col-span-2"
                  >
                    <select
                      {...register("scope")}
                      className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <option value="global">Générale (tous les tenants)</option>
                      <option value="tenant">Un tenant précis</option>
                      <option value="tenant_type">Un type de tenant</option>
                    </select>
                  </Field>

                  {selectedScope === "tenant" && (
                    <Field
                      id="rule-tenant"
                      label="Tenant"
                      required
                      error={errors.tenantId?.message}
                      className="sm:col-span-2"
                    >
                      <select
                        {...register("tenantId")}
                        className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <option value="">— Choisir —</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {selectedScope === "tenant_type" && (
                    <Field
                      id="rule-tenant-type"
                      label="Type de tenant"
                      required
                      error={errors.tenantType?.message}
                      className="sm:col-span-2"
                    >
                      <select
                        {...register("tenantType")}
                        className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <option value="">— Choisir —</option>
                        {Object.entries(TENANT_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </>
              )}

              <Field
                id="rule-type"
                label="Type"
                required
                error={errors.commissionType?.message}
              >
                <select
                  {...register("commissionType")}
                  className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <option value="percentage">Pourcentage</option>
                  <option value="fixed">Montant fixe (par exemplaire)</option>
                </select>
              </Field>

              <Field
                id="rule-value"
                label="Valeur"
                required
                error={errors.commissionValue?.message}
              >
                <Input {...register("commissionValue")} inputMode="decimal" />
              </Field>

              <Field
                id="rule-base"
                label="Base de calcul"
                required
                error={errors.calculationBase?.message}
              >
                <select
                  {...register("calculationBase")}
                  className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <option value="after_provider_fee">
                    Net après frais du prestataire
                  </option>
                  <option value="gross_amount">Montant brut</option>
                </select>
              </Field>

              <Field
                id="rule-from"
                label="En vigueur à partir du"
                required
                error={errors.effectiveFrom?.message}
              >
                <Input type="date" {...register("effectiveFrom")} />
              </Field>

              {editing && (
                <Field
                  id="rule-status"
                  label="Statut"
                  required
                  error={errors.status?.message}
                >
                  <select
                    {...register("status")}
                    className="border-border bg-card focus-visible:ring-primary/40 h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              )}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                isLoading={
                  isSubmitting || createMutation.isPending || updateMutation.isPending
                }
              >
                {!editing && <Plus aria-hidden />}
                {editing ? "Enregistrer les modifications" : "Créer la règle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette règle ?"
        description={`« ${toDelete?.name ?? ""} » ne s’appliquera plus aux prochaines ventes. Les répartitions déjà calculées conservent leurs montants.`}
        confirmLabel="Supprimer"
        isPending={deleteMutation.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof AdminApiError
    ? error.message
    : "Une erreur est survenue. Veuillez réessayer.";
}
