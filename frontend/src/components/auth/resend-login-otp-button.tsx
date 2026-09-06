"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { resendLoginOtpAction } from "@/src/lib/auth-actions";

/**
 * Toujours un succès visible après l'envoi, que le compte existe ou non
 * (`resendLoginOtpAction` ne renvoie jamais d'erreur) — même raisonnement que
 * `ResendVerificationButton`.
 */
export function ResendLoginOtpButton({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="text-primary flex items-center justify-center gap-2 text-sm font-medium">
        <Check aria-hidden className="size-4" />
        Nouveau code envoyé — pensez à vérifier vos courriers indésirables.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      isLoading={isPending}
      onClick={() =>
        startTransition(async () => {
          await resendLoginOtpAction(email);
          setSent(true);
        })
      }
    >
      Renvoyer le code
    </Button>
  );
}
