import type { TenantMemberRole } from '../../generated/prisma/enums';

/**
 * Contexte de tenant résolu pour la requête en cours (`TenantContextService.resolve`).
 *
 * Distinct de `RlsContext` (`prisma/rls-context.ts`) : celui-ci sert l'application
 * (savoir quoi afficher, quel tenant attribuer à une création), RLS reste la seule
 * autorité pour ce qui est réellement autorisé en base — les deux se recoupent sans
 * que l'un ne remplace l'autre (brief §7).
 */
export interface TenantContext {
  /**
   * `null` dans deux cas bien distincts : un platform_admin qui n'a sélectionné
   * aucun tenant actif (vue plateforme, non scopée) ; TOUJOURS résolu (jamais
   * `null`) pour un membre de tenant une fois passé `TenantAccessGuard`, qui
   * refuse la requête avant d'atteindre le contrôleur si ce n'est pas le cas.
   */
  tenantId: string | null;
  /** Rôle du membre dans `tenantId`. `null` pour un platform_admin (rôle plateforme, pas rôle de tenant). */
  role: TenantMemberRole | null;
  isPlatformAdmin: boolean;
}

/** Rôles de tenant autorisés à créer/gérer le contenu du catalogue (aligné sur les policies RLS `authors_insert`/`works_insert`). */
export const TENANT_CATALOG_WRITE_ROLES: TenantMemberRole[] = [
  'owner',
  'admin',
  'editor',
];

/** Rôles de tenant autorisés à gérer l'équipe (aligné sur les policies RLS `tenant_members_insert`/`_update`/`_delete`). */
export const TENANT_MANAGEMENT_ROLES: TenantMemberRole[] = ['owner', 'admin'];

/** Rôles de tenant autorisés à voir les chiffres de vente (aligné sur la policy RLS `sale_distributions_select`). */
export const TENANT_FINANCE_ROLES: TenantMemberRole[] = [
  'owner',
  'admin',
  'finance',
];
