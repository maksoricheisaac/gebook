"use client";

import Link from "next/link";
import { Expand, Lock } from "lucide-react";

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3 pr-14">
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

      {/* Toutes les pages autorisées, l'une sous l'autre : on lit en faisant
          défiler. Le nombre de pages est déjà limité par le backend. */}
      <div className="bg-paper-100 flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto p-4 sm:p-8">
        {pages.map((p) => (
          <figure key={p.page} className="relative w-full max-w-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- image protégée, servie par un contrôleur */}
            <img
              src={previewPageUrl(p.url)}
              alt={`${book.title} — page ${p.page}`}
              loading={p.page <= 2 ? "eager" : "lazy"}
              draggable={false}
              className="shadow-raised w-full rounded-sm bg-white select-none"
            />
            {policy.watermark && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
              >
                <span className="text-ink-900/15 -rotate-[30deg] text-5xl font-black tracking-[0.2em] whitespace-nowrap select-none sm:text-7xl">
                  PREVIEW
                </span>
              </div>
            )}
            <figcaption className="text-muted-foreground tnum mt-2 text-center text-xs">
              Page {p.page}
            </figcaption>
          </figure>
        ))}

        {reachedLimit && <PreviewWall policy={policy} bookSlug={bookSlug} />}
      </div>
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
