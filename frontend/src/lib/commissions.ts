import { cookies } from "next/headers";
import { ApiError, apiFetch } from "./api";
import type { Paginated } from "./catalog";
import { SESSION_COOKIE_NAME } from "./session-cookie";

/*
 * Revenus d'auteur et chiffres de la plateforme, côté serveur.
 *
 * Tous les montants restent des chaînes décimales : ils ne sont ni additionnés
 * ni reformatés ici, seulement affichés. Les totaux viennent de PostgreSQL, qui
 * sait sommer des décimaux exactement — refaire la somme en JavaScript
 * réintroduirait précisément le flottant que la règle n° 12 interdit.
 */

export interface AuthorRevenue {
  salesCount: number;
  grossTotal: string;
  commissionTotal: string;
  netTotal: string;
  pendingPayout: string;
}

export interface AuthorSale {
  id: string;
  orderNumber: string;
  workTitle: string;
  formatType: string;
  quantity: number;
  grossAmount: string;
  providerFee: string;
  gebookCommissionAmount: string;
  authorNetAmount: string;
  payoutStatus: string;
  soldAt: string;
}

export interface PlatformStatistics {
  publishedWorks: number;
  activeAuthors: number;
  paidOrders: number;
  readers: number;
  revenueCollected: string;
  commissionTotal: string;
  authorNetTotal: string;
  pendingPayout: string;
}

export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "À verser",
  available: "Disponible",
  partially_paid: "Partiellement versé",
  paid: "Versé",
  cancelled: "Annulé",
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {};
}

/**
 * `null` lorsque le compte connecté n'a pas de fiche d'auteur rattachée : ce
 * n'est pas une erreur, seulement un espace auteur qui n'a rien à montrer
 * (règle n° 4 — un auteur peut exister sans compte, et l'inverse aussi).
 */
export async function fetchAuthorRevenue(): Promise<AuthorRevenue | null> {
  try {
    return await apiFetch<AuthorRevenue>("/authors/me/revenue", {
      headers: await authHeaders(),
      revalidate: 0,
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) {
      return null;
    }
    throw error;
  }
}

export async function fetchAuthorSales(page = 1): Promise<Paginated<AuthorSale>> {
  return apiFetch<Paginated<AuthorSale>>("/authors/me/sales", {
    query: { page },
    headers: await authHeaders(),
    revalidate: 0,
  });
}

export interface RevenueTimeseriesPoint {
  date: string;
  revenueCollected: string;
}
