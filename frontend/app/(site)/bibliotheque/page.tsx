import Link from "next/link";
import type { Metadata } from "next";
import { Download, Info, Lock } from "lucide-react";

import { AccountShell } from "@/src/components/account/account-shell";
import { BookCover } from "@/src/components/catalog/book-cover";
import { Pagination } from "@/src/components/catalog/pagination";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { requireUser } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/format";
import {
  canDownload,
  fetchMyLibrary,
  unavailableReason,
  type LibraryEntry,
} from "@/src/lib/library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
  robots: { index: false, follow: false },
};

/** Messages d'échec du relais de téléchargement, par code de réponse de l'API. */
const DOWNLOAD_FAILURES: Record<string, string> = {
  "403":
    "Le téléchargement a été refusé : votre accès n’est plus valable ou la limite est atteinte.",
  "404":
    "Ce fichier n’est plus disponible. Les informations ci-dessous ont été rafraîchies.",
};

/**
 * Bibliothèque du lecteur.
 *
 * Chaque fiche dit trois choses : ce que le lecteur possède, s'il peut le
 * télécharger maintenant, et sinon pourquoi. Le motif du refus est affiché
 * franchement plutôt que masqué derrière un bouton qui échouerait.
 */
export default async function LibraryPage(props: PageProps<"/bibliotheque">) {
  const user = await requireUser("/bibliotheque");

  const searchParams = await props.searchParams;
  const pageParam = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const page = Math.max(1, Number(pageParam) || 1);
  const failure = Array.isArray(searchParams.echec)
    ? searchParams.echec[0]
    : searchParams.echec;

  const library = await fetchMyLibrary(page);

  return (
    <AccountShell
      user={user}
      title="Ma bibliothèque"
      description={
        library.meta.total > 0
          ? `${library.meta.total} ${library.meta.total > 1 ? "ouvrages accessibles" : "ouvrage accessible"} depuis votre compte.`
          : undefined
      }
      actions={
        <Button asChild variant="outline">
          <Link href="/livres">Parcourir le catalogue</Link>
        </Button>
      }
    >
      {failure && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive-muted/40 text-secondary mb-8 rounded-lg border px-4 py-3 text-sm"
        >
          {DOWNLOAD_FAILURES[failure] ??
            "Le téléchargement n’a pas abouti. Veuillez réessayer."}
        </p>
      )}

      {library.data.length === 0 ? (
        <EmptyState
          title="Votre bibliothèque est vide"
          description="Les ouvrages numériques que vous achetez s’ajoutent ici automatiquement, dès que le paiement est confirmé."
        >
          <Button asChild>
            <Link href="/livres">Découvrir le catalogue</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {library.data.map((entry) => (
            <li key={entry.id}>
              <LibraryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={library.meta.page}
        totalPages={library.meta.totalPages}
        buildHref={(targetPage) =>
          targetPage > 1 ? `/bibliotheque?page=${targetPage}` : "/bibliotheque"
        }
      />
    </AccountShell>
  );
}

function LibraryCard({ entry }: { entry: LibraryEntry }) {
  const available = canDownload(entry);
  const reason = unavailableReason(entry);

  return (
    <article className="border-border bg-card flex gap-5 rounded-lg border p-4 sm:p-5">
      <Link
        href={`/livres/${entry.workSlug}`}
        className="w-20 shrink-0 sm:w-24"
        tabIndex={-1}
        aria-hidden
      >
        <BookCover
          title={entry.workTitle}
          authorName={entry.authorName}
          coverPath={entry.coverPath}
          sizes="96px"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="text-secondary leading-snug font-semibold">
                <Link href={`/livres/${entry.workSlug}`} className="hover:underline">
                  {entry.workTitle}
                </Link>
              </h2>
              <p className="type-caption">{entry.authorName}</p>
            </div>
            <Badge variant="tag">{entry.formatType}</Badge>
          </div>

          <p className="type-meta mt-2">
            Ajouté le {formatDate(entry.grantedAt)}
            {entry.downloadLimit !== null &&
              ` · ${entry.downloadCount}/${entry.downloadLimit} téléchargements`}
            {entry.downloadLimit === null &&
              entry.downloadCount > 0 &&
              ` · ${entry.downloadCount} téléchargement${entry.downloadCount > 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {available ? (
            <Button asChild size="sm">
              {/*
               * Lien direct plutôt que Server Action : le navigateur doit
               * recevoir un flux de fichier, pas naviguer vers une page.
               * `download` laisse le nom proposé par l'API s'appliquer.
               */}
              <a href={`/api/library/${entry.id}/download`} download>
                <Download aria-hidden />
                Télécharger
                <span className="sr-only"> — {entry.workTitle}</span>
              </a>
            </Button>
          ) : (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              {entry.accessStatus === "active" ? (
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              ) : (
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              )}
              {reason}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
