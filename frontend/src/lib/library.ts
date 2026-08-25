import { cookies } from "next/headers";
import { apiFetch } from "./api";
import type { Paginated } from "./catalog";
import { SESSION_COOKIE_NAME } from "./session-cookie";

/*
 * Bibliothèque du lecteur, côté serveur.
 *
 * Même raisonnement que `orders.ts` : un Server Component ne reçoit aucun cookie
 * de navigateur automatiquement, il faut le relire ici et le retransmettre à
 * l'API à chaque appel.
 *
 * Le fichier lui-même ne transite jamais par ce module : il passe par le relais
 * `app/api/library/[id]/download`, seul endroit où le flux est retransmis.
 */

export interface LibraryEntry {
  id: string;
  accessStatus: "active" | "revoked" | "expired";
  grantedAt: string;
  expiresAt: string | null;
  workTitle: string;
  workSlug: string;
  authorName: string;
  coverPath: string | null;
  formatType: string;
  deliveryType: string;
  isDownloadable: boolean;
  downloadCount: number;
  /** `null` lorsque les téléchargements sont illimités. */
  downloadLimit: number | null;
}

/** Vrai si le lecteur peut réellement obtenir le fichier maintenant. */
export function canDownload(entry: LibraryEntry): boolean {
  return (
    entry.accessStatus === "active" &&
    entry.isDownloadable &&
    (entry.downloadLimit === null || entry.downloadCount < entry.downloadLimit)
  );
}

/**
 * Raison pour laquelle le téléchargement n'est pas proposé. `null` s'il l'est.
 * Le texte reprend la formulation de l'API plutôt que d'en inventer une autre.
 */
export function unavailableReason(entry: LibraryEntry): string | null {
  if (entry.accessStatus === "revoked") {
    return "Votre accès à cet ouvrage a été révoqué.";
  }
  if (entry.accessStatus === "expired") {
    return "Votre accès à cet ouvrage a expiré.";
  }
  if (!entry.isDownloadable) {
    return "Le fichier n’est pas encore disponible. Il le sera dès que l’éditeur l’aura déposé.";
  }
  if (entry.downloadLimit !== null && entry.downloadCount >= entry.downloadLimit) {
    return `Vous avez atteint la limite de ${entry.downloadLimit} téléchargements pour cet ouvrage.`;
  }
  return null;
}

export async function fetchMyLibrary(page = 1): Promise<Paginated<LibraryEntry>> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  return apiFetch<Paginated<LibraryEntry>>("/library", {
    query: { page },
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    // Statut d'accès et compteur de téléchargements : jamais mis en cache.
    revalidate: 0,
  });
}
