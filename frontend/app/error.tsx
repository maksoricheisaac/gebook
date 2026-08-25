"use client";

import { useEffect } from "react";
import { Button } from "@/src/components/ui/button";

/** Limite de la couche gratuite : les erreurs de rendu sont interceptées, pas les erreurs de fond attendues comme les 404 (traitées par `not-found.tsx`). */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-primary text-sm font-semibold tracking-wide uppercase">
        Erreur serveur
      </p>
      <h1 className="text-3xl sm:text-4xl">Une erreur est survenue</h1>
      <p className="text-muted-foreground">
        GeBook n&rsquo;a pas pu traiter la demande pour le moment.
      </p>
      <Button size="lg" className="mt-4" onClick={() => retry()}>
        Réessayer
      </Button>
    </div>
  );
}
