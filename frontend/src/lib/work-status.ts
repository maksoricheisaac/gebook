/**
 * Statuts de publication d'une œuvre.
 *
 * Les libellés étaient dupliqués dans `work-list.tsx` et `work-editor.tsx`, et
 * n'existaient qu'en texte brut dans la liste : « draft » et « published » s'y
 * lisaient avec exactement le même poids visuel. Les regrouper ici permet de
 * leur donner aussi une teinte, cohérente avec celle des statuts de commande.
 */

export type WorkStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "published"
  | "rejected"
  | "inactive"
  | "archived";

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  draft: "Brouillon",
  submitted: "Soumise à la relecture",
  under_review: "En relecture",
  approved: "Approuvée",
  published: "Publiée",
  rejected: "Rejetée",
  inactive: "Inactive",
  archived: "Archivée",
};

const TONES: Record<WorkStatus, "neutral" | "success" | "warning"> = {
  draft: "warning",
  submitted: "warning",
  under_review: "warning",
  approved: "success",
  published: "success",
  rejected: "neutral",
  inactive: "neutral",
  archived: "neutral",
};

export function workStatusTone(status: WorkStatus): "neutral" | "success" | "warning" {
  return TONES[status] ?? "neutral";
}
