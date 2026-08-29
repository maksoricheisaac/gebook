/**
 * Libellés du type d'espace, partagés entre le formulaire de création
 * (`create-workspace-form.tsx`) et la vitrine publique (Phase 5) — auparavant
 * dupliqués implicitement, faute d'un deuxième appelant pour justifier de les
 * extraire plus tôt.
 */
export const TENANT_TYPE_LABELS: Record<string, string> = {
  independent_author: "Auteur indépendant",
  publishing_house: "Maison d'édition",
  collective: "Collectif d'auteurs",
  cultural_organization: "Organisation culturelle",
};

export const TENANT_TYPE_OPTIONS = Object.entries(TENANT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
