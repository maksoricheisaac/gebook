import { cookies } from "next/headers";
import { apiFetch, ApiError } from "./api";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export interface DistributionTerms {
  id: string;
  tenantType: string;
  version: number;
  title: string;
  content: string;
  isActive: boolean;
  publishedAt: string;
}

/**
 * Version en vigueur des conditions de distribution pour un type de tenant
 * (mission plateforme de paiement, §17). `null` si aucune n'est publiée pour
 * ce type — l'onboarding ne doit pas planter pour autant, seulement ne rien
 * avoir à faire accepter.
 */
export async function getActiveDistributionTerms(
  tenantType: string,
): Promise<DistributionTerms | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    return await apiFetch<DistributionTerms>(`/distribution-terms/${tenantType}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      revalidate: 0,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      return null;
    }
    throw error;
  }
}
