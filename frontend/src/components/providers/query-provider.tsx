"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AdminApiError } from "@/src/lib/admin-api";

/**
 * TanStack Query, réservé au back-office (audit §27) : les pages publiques sont
 * rendues côté serveur et n'ont rien à mettre en cache côté client. Un client par
 * session de navigation — `useState` garantit qu'il n'est créé qu'une fois, pas à
 * chaque rendu.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            // Un 4xx (droits insuffisants, ressource absente…) ne se corrige
            // pas en réessayant : le seul effet d'un retry ici est la fenêtre
            // où `isLoading` redevient faux entre l'échec et la tentative
            // suivante, pendant laquelle `error` est encore `null` — la page
            // affiche alors un message générique au lieu du message réel du
            // backend. Seules les pannes (réseau, 5xx) valent une nouvelle
            // tentative.
            retry: (failureCount, error) =>
              error instanceof AdminApiError && error.statusCode < 500
                ? false
                : failureCount < 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
