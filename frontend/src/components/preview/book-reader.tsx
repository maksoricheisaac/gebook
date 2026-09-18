"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Lock } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import type { PreviewResponse } from "@/src/lib/preview";
import { previewPageUrl } from "@/src/lib/preview";
import { cn } from "@/src/lib/utils";

const MODE_LABELS: Record<PreviewResponse["preview"]["mode"], string> = {
  admin: "Aperçu administrateur",
  author: "Aperçu auteur",
  owned: "Livre acheté",
  reader: "Aperçu lecteur",
  public: "Aperçu visiteur",
};

/**
 * Lecteur de la Book Preview Sandbox — pur affichage de ce que le backend a
 * déjà décidé de transmettre (brief §5) : aucune logique d'autorisation ici,
 * `pages` EST la liste des pages que ce visiteur a le droit de voir. Le
 * « mur » de fin d'aperçu n'est pas une restriction supplémentaire, c'est
 * l'affichage honnête du fait qu'il n'y a rien de plus à montrer.
 */
export function BookReader({
  preview,
  bookSlug,
  onFullscreen,
  isFullscreen = false,
}: {
  preview: PreviewResponse;
  bookSlug: string;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
}) {
  const { book, preview: policy, pages } = preview;
  // Pas de `useEffect` pour réinitialiser `page` : ce composant se démonte à
  // chaque fermeture de la modale (`BookPreview`) et remonte frais à chaque
  // ouverture — l'état initial est déjà le bon.
  const [page, setPage] = useState(1);
  const atWall = pages.length > 0 && page > pages.length;
  const reachedLimit = policy.totalPages > pages.length;

  if (policy.status !== "ready" || pages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-secondary font-medium">
          {policy.status === "pending"
            ? "L’aperçu est en cours de préparation."
            : "Cette œuvre ne peut pas être prévisualisée pour le moment."}
        </p>
        {policy.status === "pending" && (
          <p className="text-muted-foreground text-sm">Revenez dans quelques instants.</p>
        )}
      </div>
    );
  }

  const currentUrl = !atWall ? previewPageUrl(pages[page - 1].url) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-secondary truncate text-sm font-semibold">{book.title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="neutral">{MODE_LABELS[policy.mode]}</Badge>
          {policy.canFullscreen && onFullscreen && (
            <Button type="button" variant="ghost" size="icon" onClick={onFullscreen}>
              <Expand aria-hidden className="size-4" />
              <span className="sr-only">
                {isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              </span>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-paper-100 relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        {atWall ? (
          <PreviewWall policy={policy} bookSlug={bookSlug} />
        ) : (
          <div className="relative max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- image protégée, servie par un contrôleur, jamais un asset Next optimisable */}
            <img
              key={currentUrl}
              src={currentUrl!}
              alt={`${book.title} — page ${page}`}
              className="shadow-raised max-h-[70vh] w-auto rounded-sm object-contain sm:max-h-full"
            />
            {policy.watermark && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="text-ink-900/15 -rotate-[24deg] text-2xl font-bold whitespace-nowrap select-none sm:text-4xl">
                  Aperçu — GeBook
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {policy.canNavigate && (
        <div className="border-border flex items-center justify-center gap-4 border-t px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span className="sr-only">Page précédente</span>
          </Button>
          <span className="text-muted-foreground tnum text-sm">
            {Math.min(page, pages.length)} /{" "}
            {reachedLimit ? `${pages.length}+` : pages.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={atWall}
            onClick={() => setPage((p) => Math.min(pages.length + 1, p + 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
            <span className="sr-only">Page suivante</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewWall({
  policy,
  bookSlug,
}: {
  policy: PreviewResponse["preview"];
  bookSlug: string;
}) {
  const showLogin = policy.mode === "public" && policy.requiresAuth;

  return (
    <div
      className={cn(
        "bg-card shadow-raised mx-auto flex max-w-sm flex-col items-center gap-4 rounded-xl border p-8 text-center",
      )}
    >
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        <Lock aria-hidden className="size-5" />
      </span>
      <div>
        <p className="text-secondary font-semibold">Vous avez atteint l’aperçu.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {showLogin
            ? "Connectez-vous pour lire davantage de pages gratuitement."
            : "Achetez ce livre pour continuer votre lecture."}
        </p>
      </div>
      <Button asChild>
        {showLogin ? (
          <Link href={`/connexion?retour=${encodeURIComponent(`/livres/${bookSlug}`)}`}>
            Se connecter pour continuer
          </Link>
        ) : (
          <Link href={`/livres/${bookSlug}`}>Acheter le livre</Link>
        )}
      </Button>
    </div>
  );
}
