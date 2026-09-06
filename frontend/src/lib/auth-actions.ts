"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api";
import { resolveDestination } from "./auth";
import { safeRedirectPath } from "./auth-shared";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

interface AuthUserPayload {
  roles: string[];
}

type AuthOutcome =
  | { status: "ok"; user: AuthUserPayload }
  | { status: "verification_required"; email: string }
  | { status: "otp_required"; email: string }
  | { formState: AuthFormState };

/**
 * Pose le cookie de session de première partie à partir du `Set-Cookie` renvoyé
 * par l'API — voir le commentaire de `proxyAuthRequest` ci-dessous pour le
 * pourquoi de cette indirection.
 */
async function applySessionCookie(response: Response): Promise<void> {
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return;
  }

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

/**
 * Connexion, inscription et déconnexion passent par une Server Action plutôt que par
 * un appel direct du navigateur à l'API (audit §32).
 *
 * En production, le frontend et l'API vivent sur des origines différentes : un cookie
 * posé directement par l'API y serait un cookie tiers, exposé aux restrictions de plus
 * en plus strictes des navigateurs. Passer par le serveur Next.js fait du cookie un
 * cookie de première partie du point de vue du visiteur — l'API ne voit qu'un appel
 * serveur à serveur, jamais le navigateur.
 *
 * `/auth/register` et `/auth/login` renvoient désormais un troisième état, distinct
 * d'une erreur : l'adresse e-mail reste à confirmer, aucune session n'est créée
 * (brief « vérification d'e-mail obligatoire »).
 */
export async function proxyAuthRequest(
  path: string,
  body: unknown,
): Promise<AuthOutcome> {
  // Next.js exige déjà cet en-tête sur toute Server Action : le réutiliser ici évite
  // d'inventer une nouvelle variable d'environnement pour la même information.
  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { status: "ok"; user: AuthUserPayload }
    | { status: "verification_required"; email: string }
    | { status: "otp_required"; email: string }
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

  if (payload && "status" in payload && payload.status === "verification_required") {
    return { status: "verification_required", email: payload.email };
  }

  if (payload && "status" in payload && payload.status === "otp_required") {
    return { status: "otp_required", email: payload.email };
  }

  await applySessionCookie(response);

  return { status: "ok", user: (payload as { user: AuthUserPayload }).user };
}

function retourFrom(formData: FormData): string | undefined {
  return safeRedirectPath(formData.get("retour"));
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

  if (result.status === "verification_required" || result.status === "otp_required") {
    redirect(`/verifier-email?email=${encodeURIComponent(result.email)}`);
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

  if (result.status === "verification_required") {
    redirect(`/verifier-email?email=${encodeURIComponent(result.email)}`);
  }

  if (result.status === "otp_required") {
    const retour = retourFrom(formData);
    redirect(
      `/connexion/code?email=${encodeURIComponent(result.email)}` +
        (retour ? `&retour=${encodeURIComponent(retour)}` : ""),
    );
  }

  redirect(retourFrom(formData) ?? (await resolveDestination(result.user.roles)));
}

/**
 * Consomme le jeton du lien reçu par e-mail : vérifie l'adresse et connecte
 * directement (brief « un clic sur le lien envoyé par e-mail vaut connexion »).
 *
 * Même forme que `registerAction`/`loginAction` (état de formulaire en cas
 * d'échec, `redirect()` en cas de succès) : la page `/verifier-email` soumet
 * un formulaire caché automatiquement au chargement plutôt que d'appeler ceci
 * directement, pour que la résolution de destination (rôles, tenant actif)
 * reste côté serveur, exactement comme après une connexion normale.
 */
export async function verifyEmailAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = formData.get("token");
  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ token }),
  });

  const payload = (await response.json().catch(() => null)) as
    (AuthUserPayload & Record<string, unknown>) | { message?: string } | null;

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string };
    return {
      error: record.message ?? "Ce lien de vérification est invalide ou a expiré.",
    };
  }

  await applySessionCookie(response);

  const user = payload as AuthUserPayload;
  redirect(await resolveDestination(user.roles));
}

/**
 * Renvoi manuel du lien de vérification, depuis la page « vérifiez votre boîte
 * mail ». Toujours silencieux côté API (204, que le compte existe ou non) —
 * voir `AuthService.resendVerification()` côté backend.
 */
export async function resendVerificationAction(email: string): Promise<void> {
  const origin = (await headers()).get("origin") ?? "";

  await fetch(`${apiBaseUrl()}/auth/verify-email/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email }),
  }).catch(() => undefined);
}

/**
 * Termine une connexion en attente de code (`loginAction` → `/connexion/code`) :
 * seule cette action ouvre réellement une session après une connexion par mot
 * de passe (audit pré-production).
 */
export async function verifyLoginOtpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");
  const code = formData.get("code");
  const origin = (await headers()).get("origin") ?? "";

  const response = await fetch(`${apiBaseUrl()}/auth/login/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, code }),
  });

  const payload = (await response.json().catch(() => null)) as
    (AuthUserPayload & Record<string, unknown>) | { message?: string } | null;

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string };
    return { error: record.message ?? "Code invalide ou expiré." };
  }

  await applySessionCookie(response);

  const user = payload as AuthUserPayload;
  redirect(retourFrom(formData) ?? (await resolveDestination(user.roles)));
}

/**
 * Renvoi manuel du code de connexion, depuis la page « saisissez votre code ».
 * Toujours silencieux côté API (204, que le compte existe ou non) — voir
 * `AuthService.resendLoginOtp()` côté backend.
 */
export async function resendLoginOtpAction(email: string): Promise<void> {
  const origin = (await headers()).get("origin") ?? "";

  await fetch(`${apiBaseUrl()}/auth/login/otp/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email }),
  }).catch(() => undefined);
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
