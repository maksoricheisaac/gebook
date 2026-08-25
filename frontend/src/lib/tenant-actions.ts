"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import { ACTIVE_TENANT_COOKIE_NAME, type TenantMembership } from "./tenant-shared";

export interface SetActiveTenantResult {
  membership?: TenantMembership;
  error?: string;
}

export interface CreateTenantFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Onboarding : un lecteur devient propriétaire d'un nouvel espace (brief §7).
 *
 * Même raisonnement que `setActiveTenantAction` — le cookie d'espace actif est
 * posé ici, sur l'origine du frontend, jamais relayé tel quel depuis l'API —
 * et même schéma de retour que `registerAction`/`loginAction`
 * (`error`/`fieldErrors`) pour que `CreateWorkspaceForm` réutilise
 * `useActionState` et `<Field error=…>` sans rien réinventer.
 */
export async function createTenantAction(
  _previous: CreateTenantFormState,
  formData: FormData,
): Promise<CreateTenantFormState> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { error: "Vous devez être connecté." };
  }

  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/tenants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({
      name: formData.get("name"),
      slug: formData.get("slug"),
      type: formData.get("type"),
      description: formData.get("description") || undefined,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (TenantMembership & Record<string, unknown>)
    | { message?: string; errors?: Record<string, string[]> }
    | null;

  if (!response.ok) {
    const record = (payload ?? {}) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    return {
      error: record.message ?? "Impossible de créer cet espace pour le moment.",
      fieldErrors: record.errors,
    };
  }

  const membership = payload as TenantMembership;

  (await cookies()).set(ACTIVE_TENANT_COOKIE_NAME, membership.tenantId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/admin");
}

/**
 * Bascule de tenant actif, appelée par `TenantProvider.switchTenant()`.
 *
 * Passe par une Server Action plutôt que par un appel direct du navigateur à
 * l'API, pour la même raison que `auth-actions.ts` (audit §32) : en
 * production, frontend et API vivent sur des origines différentes, et un
 * cookie posé par l'en-tête `Set-Cookie` de l'API y serait tiers. Le cookie
 * qui persiste le choix est donc posé ici, sur l'origine du frontend — jamais
 * relayé tel quel depuis la réponse de l'API.
 *
 * Ceci dit, ce cookie n'autorise rien par lui-même : l'API revalide toujours
 * l'adhésion réelle (`TenantsController.setActive`, RLS) avant de répondre.
 * Un rejet ici reflète un rejet côté API, jamais une décision prise sur la
 * seule foi de ce que le client a envoyé.
 */
export async function setActiveTenantAction(
  tenantId: string,
): Promise<SetActiveTenantResult> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { error: "Vous devez être connecté." };
  }

  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/tenants/me/active`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ tenantId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (TenantMembership & Record<string, unknown>)
    | { message?: string }
    | null;

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string };
    return {
      error: record.message ?? "Impossible de changer d'espace pour le moment.",
    };
  }

  const membership = payload as TenantMembership;

  (await cookies()).set(ACTIVE_TENANT_COOKIE_NAME, membership.tenantId, {
    // Volontairement lisible par le client : `TenantProvider` s'en sert pour
    // réhydrater l'état sans aller-retour serveur, exactement comme
    // `activeTenantCookieOptions()` côté API.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { membership };
}

/** Efface le tenant actif persisté — pas d'appel à l'API : rien à y invalider. */
export async function clearActiveTenantAction(): Promise<void> {
  (await cookies()).delete(ACTIVE_TENANT_COOKIE_NAME);
}
