"use server";

import { headers } from "next/headers";
import { apiBaseUrl } from "./api";

export interface ContactFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Horodatage du dernier envoi réussi, plutôt qu'un simple booléen : deux
   * envois réussis d'affilée doivent tous deux déclencher le toast côté
   * client, qui ne réagit qu'à un changement de valeur (voir `contact-form.tsx`).
   */
  submittedAt?: number;
}

/**
 * Envoi du formulaire de contact public.
 *
 * Passe par une Server Action comme `proxyAuthRequest` (`auth-actions.ts`) :
 * `OriginGuard` (backend) exige un en-tête `Origin` sur toute écriture, et un
 * appel serveur à serveur garantit qu'il est toujours présent, sans dépendre
 * du navigateur du visiteur.
 */
export async function submitContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      name: formData.get("name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      errors?: Record<string, string[]>;
    } | null;

    return {
      error: payload?.message ?? "Une erreur est survenue. Veuillez réessayer.",
      fieldErrors: payload?.errors,
    };
  }

  return { submittedAt: Date.now() };
}
