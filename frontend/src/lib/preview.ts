/**
 * Book Preview Sandbox — types et client pour `/api/preview/*`.
 *
 * Le backend est la seule autorité (`PreviewPolicyService`) : ce fichier ne
 * fait que refléter la forme de sa réponse, jamais recalculer une politique
 * d'accès côté client (une politique côté client n'a aucune valeur de
 * sécurité — voir le composant `BookReader`, qui ne fait qu'afficher ce que
 * le backend a déjà décidé de transmettre).
 */

export type PreviewMode = "admin" | "author" | "owned" | "reader" | "public";

export interface PreviewPage {
  page: number;
  url: string;
}

export interface PreviewResponse {
  book: {
    id: string;
    title: string;
    author: string;
    cover: string | null;
    slug: string;
  };
  preview: {
    mode: PreviewMode;
    status: "ready" | "pending" | "failed" | "none";
    maxPages: number | null;
    totalPages: number;
    canNavigate: boolean;
    canFullscreen: boolean;
    canDownload: boolean;
    watermark: boolean;
    isFree: boolean;
    requiresAuth: boolean;
  };
  pages: PreviewPage[];
}

export class PreviewError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PreviewError";
    this.statusCode = statusCode;
  }
}

export async function fetchPreview(slug: string): Promise<PreviewResponse> {
  const response = await fetch(`/api/preview/${encodeURIComponent(slug)}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new PreviewError(
      response.status,
      body?.message ?? "Impossible de charger l’aperçu.",
    );
  }

  return response.json() as Promise<PreviewResponse>;
}

/** URL relative d'une page — sert directement de `src` d'image, le
 * navigateur porte le cookie de session lui-même (même origine). */
export function previewPageUrl(url: string): string {
  return `/api${url}`;
}
