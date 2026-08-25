"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export interface PaymentFormState {
  error?: string;
}

/**
 * Paiement en Server Actions, pour la même raison que la commande dans
 * `order-actions.ts` : le cookie de session vit sur l'origine du frontend, un
 * appel direct du navigateur vers l'API ne le porterait pas.
 *
 * Aucune règle métier n'est reproduite ici. En particulier, ces actions ne
 * décident jamais qu'un paiement a réussi : elles relaient une demande, et c'est
 * la notification signée du prestataire qui fait foi côté API.
 */
async function postToApi(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { ok: false, message: "Votre session a expiré. Veuillez vous reconnecter." };
  }

  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string };
    return {
      ok: false,
      message: record.message ?? "Une erreur est survenue. Veuillez réessayer.",
    };
  }

  return { ok: true, data: payload };
}

/** Ouvre une tentative de paiement pour une commande. */
export async function startPaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Commande introuvable." };
  }

  const result = await postToApi("/payments", { orderNumber });
  if (!result.ok) {
    return { error: result.message };
  }

  const { checkoutUrl } = (result.data ?? {}) as { checkoutUrl?: string | null };

  // Un prestataire réel héberge sa propre page de paiement : le lecteur y est
  // envoyé, et reviendra sur cette commande une fois l'opération terminée.
  if (checkoutUrl) {
    redirect(checkoutUrl);
  }

  revalidatePath(`/paiement/${orderNumber}`);
  return {};
}

/**
 * Demande au prestataire de simulation d'émettre une notification de règlement.
 *
 * Réservée au développement : l'API refuse cet appel en production et n'accepte
 * que le pilote factice. La notification produite suit le chemin de vérification
 * habituel, signature comprise — rien n'est marqué comme payé par raccourci.
 */
export async function simulatePaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const paymentId = formData.get("paymentId");
  const orderNumber = formData.get("orderNumber");
  const outcome = formData.get("outcome");

  if (
    typeof paymentId !== "string" ||
    typeof orderNumber !== "string" ||
    typeof outcome !== "string"
  ) {
    return { error: "Simulation impossible : informations manquantes." };
  }

  const result = await postToApi(`/payments/${paymentId}/simulate`, { outcome });
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath(`/paiement/${orderNumber}`);
  return {};
}
