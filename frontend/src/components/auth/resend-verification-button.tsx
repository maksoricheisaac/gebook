"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { resendVerificationAction } from "@/src/lib/auth-actions";

/**
 * Toujours un succès visible après l'envoi, que le compte existe ou non
 * (`resendVerificationAction` ne renvoie jamais d'erreur) — une réponse
 * différenciée révélerait quelles adresses sont inscrites.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="text-primary flex items-center justify-center gap-2 text-sm font-medium">
        <Check aria-hidden className="size-4" />
        E-mail renvoyé — pensez à vérifier vos courriers indésirables.
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
          await resendVerificationAction(email);
          setSent(true);
        })
      }
    >
      Renvoyer l’e-mail de vérification
    </Button>
  );
}
