"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { type AuthFormState, proxyAuthRequest } from "./auth-actions";

export interface SetupStatus {
  completed: boolean;
}

/** Lu côté serveur avant d'afficher l'assistant : la route ne sert plus à rien une fois fermée. */
export async function getSetupStatus(): Promise<SetupStatus> {
  return apiFetch<SetupStatus>("/setup/status", { revalidate: 0 });
}

export async function createSuperadminAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await proxyAuthRequest("/setup/superadmin", {
    token: formData.get("token"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if ("formState" in result) {
    return result.formState;
  }

  redirect("/admin");
}
