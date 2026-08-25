"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export interface PurchaseFormState {
  error?: string;
  /** Erreurs de validation renvoyées par l'API, indexées par champ. */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Champs de remise acceptés par `POST /orders`.
 *
 * Ils ne sont transmis que s'ils sont renseignés : envoyer une adresse vide sur
 * une commande purement numérique la ferait rejeter par la validation de l'API.
 */
const DELIVERY_FIELDS = [
  "recipientName",
  "deliveryPhone",
  "deliveryCountry",
  "deliveryCity",
  "deliveryDistrict",
  "deliveryAddress",
  "deliveryLandmark",
] as const;

/**
 * Achat immédiat d'un format, en Server Action — même raisonnement que la
 * connexion dans `auth-actions.ts` : le cookie de session vit sur l'origine du
 * frontend, un appel direct du navigateur vers l'API ne le porterait pas.
 *
 * Aucune règle métier n'est reproduite ici. En particulier, ce n'est pas cette
 * fonction qui décide si une adresse est requise : elle transmet ce que le
 * formulaire a collecté, et c'est `OrdersService` qui tranche selon le mode de
 * remise du format commandé.
 */
export async function purchaseAction(
  _previous: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const workFormatId = formData.get("workFormatId");
  const workSlug = formData.get("workSlug");

  if (typeof workFormatId !== "string" || !workFormatId) {
    return { error: "Veuillez choisir un format." };
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    // Filet de sécurité : la session a pu expirer entre le chargement de la page
    // et le clic. Le format choisi voyage jusqu'à la connexion, comme au premier
    // essai.
    redirect(
      typeof workSlug === "string"
        ? `/connexion?retour=${encodeURIComponent(`/livres/${workSlug}?format=${workFormatId}`)}`
        : "/connexion",
    );
  }

  const delivery: Record<string, string> = {};
  for (const field of DELIVERY_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string" && value.trim() !== "") {
      delivery[field] = value.trim();
    }
  }

  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({
      items: [{ workFormatId, quantity: 1 }],
      ...delivery,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    orderNumber?: string;
    message?: string;
    errors?: Record<string, string[]>;
  } | null;

  if (!response.ok || !payload?.orderNumber) {
    return {
      error: payload?.message ?? "Une erreur est survenue. Veuillez réessayer.",
      fieldErrors: payload?.errors,
    };
  }

  redirect(`/paiement/${payload.orderNumber}`);
}
