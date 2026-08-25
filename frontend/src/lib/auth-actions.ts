"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api";
import { resolveDestination } from "./auth";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

interface AuthUserPayload {
  roles: string[];
}

/**
 * Connexion, inscription et déconnexion passent par une Server Action plutôt que par
 * un appel direct du navigateur à l'API (audit §32).
 *
 * En production, le frontend et l'API vivent sur des origines différentes : un cookie
 * posé directement par l'API y serait un cookie tiers, exposé aux restrictions de plus
 * en plus strictes des navigateurs. Passer par le serveur Next.js fait du cookie un
 * cookie de première partie du point de vue du visiteur — l'API ne voit qu'un appel
 * serveur à serveur, jamais le navigateur.
 */
export async function proxyAuthRequest(
  path: string,
  body: unknown,
): Promise<{ user: AuthUserPayload } | { formState: AuthFormState }> {
  // Next.js exige déjà cet en-tête sur toute Server Action : le réutiliser ici évite
  // d'inventer une nouvelle variable d'environnement pour la même information.
  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | (AuthUserPayload & Record<string, unknown>)
    | { message?: string; errors?: Record<string, string[]> }
    | null;

  if (!response.ok) {
    const record = (payload ?? {}) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    return {
      formState: {
        error: record.message ?? "Une erreur est survenue. Veuillez réessayer.",
        fieldErrors: record.errors,
      },
    };
  }

  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (sessionCookie) {
    const token = sessionCookie.split(";")[0]?.split("=")[1];
    const expiresMatch = /Expires=([^;]+)/i.exec(sessionCookie);

    if (token) {
      (await cookies()).set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresMatch?.[1] ? new Date(expiresMatch[1]) : undefined,
      });
    }
  }

  return { user: payload as AuthUserPayload };
}

function retourFrom(formData: FormData): string | undefined {
  const value = formData.get("retour");
  return typeof value === "string" && value.startsWith("/") ? value : undefined;
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await proxyAuthRequest("/auth/register", {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });

  if ("formState" in result) {
    return result.formState;
  }

  redirect(retourFrom(formData) ?? (await resolveDestination(result.user.roles)));
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await proxyAuthRequest("/auth/login", {
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if ("formState" in result) {
    return result.formState;
  }

  redirect(retourFrom(formData) ?? (await resolveDestination(result.user.roles)));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const origin = (await headers()).get("origin") ?? "";

  if (token) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { Origin: origin, cookie: `${SESSION_COOKIE_NAME}=${token}` },
      // La déconnexion doit rester silencieuse même si l'API est momentanément
      // injoignable : le cookie local est de toute façon effacé juste après.
    }).catch(() => undefined);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/");
}
