/**
 * Échafaudage temporaire (Phase 3 → Phase 5, `new_stack/AUDIT_V2_MULTI_TENANT.md`).
 *
 * Le modèle de données est multi-tenant depuis la migration
 * `20260823010000_add_multi_tenant_core`, mais la résolution du tenant actif
 * (`TenantContext`, guards `@TenantRoles()`, en-tête/sous-domaine de tenant)
 * n'existe pas encore — c'est l'objet de la Phase 5. En attendant, les
 * services qui touchent au catalogue continuent d'opérer sur l'unique tenant
 * existant, "Mampouya Éditions", pour ne pas casser le back-office actuel.
 *
 * Ne pas ajouter de nouvelle dépendance à cette constante : tout nouveau code
 * qui a besoin du tenant actif doit attendre `TenantContext` (Phase 5) plutôt
 * que de multiplier les références à un tenant fixe.
 */
export const LEGACY_SINGLE_TENANT_ID = 'e000ff30-9153-4226-9010-0ba3f640d23c';
