/** Libellés lisibles des codes d'action du journal d'activité (`ActivityLogService.record`). */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  "admin.author.create": "Auteur créé",
  "admin.author.update": "Auteur modifié",
  "admin.author.delete": "Auteur supprimé",
  "admin.author.photo": "Photo d'auteur modifiée",
  "admin.category.create": "Catégorie créée",
  "admin.category.update": "Catégorie modifiée",
  "admin.category.delete": "Catégorie supprimée",
  "admin.work.create": "Œuvre créée",
  "admin.work.update": "Œuvre modifiée",
  "admin.work.delete": "Œuvre supprimée",
  "admin.work.feature": "Œuvre mise en avant",
  "admin.work.unfeature": "Mise en avant retirée",
  "admin.work.cover": "Couverture modifiée",
  "admin.work.format.create": "Format ajouté",
  "admin.work.format.update": "Format modifié",
  "admin.work.format.delete": "Format supprimé",
  "admin.work.format.file": "Fichier de format téléversé",
  "admin.commission-rule.create": "Règle de commission créée",
  "admin.commission-rule.update": "Règle de commission modifiée",
  "admin.commission-rule.delete": "Règle de commission supprimée",
  "order.create": "Commande passée",
  "order.cancel": "Commande annulée",
  "admin.order.status": "Statut de commande modifié",
  "admin.order.refund": "Commande remboursée",
  "payment.initialize": "Paiement initié",
  "auth.setup.superadmin_created": "Compte superadmin créé",
  "admin.distribution-terms.publish": "Conditions de répartition publiées",
  "admin.team.invite": "Membre invité",
  "admin.team.update_role": "Rôle de membre modifié",
  "admin.team.remove": "Membre retiré",
};

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action;
}

/** Libellés des types d'entité (`entity_type`), pour compléter le libellé d'action à l'affichage. */
export const ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  author: "auteur",
  category: "catégorie",
  work: "œuvre",
  work_format: "format",
  commission_rule: "règle de commission",
  order: "commande",
  payment: "paiement",
  user: "utilisateur",
  tenant_member: "membre",
  distribution_terms: "conditions de répartition",
};

export function activityEntityLabel(entityType: string | null): string | null {
  if (!entityType) return null;
  return ACTIVITY_ENTITY_LABELS[entityType] ?? entityType;
}
