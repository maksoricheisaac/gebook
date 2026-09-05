import Link from "next/link";
import type { Metadata } from "next";

import { AuthorCard } from "@/src/components/catalog/author-card";
import { SimpleSearchForm } from "@/src/components/catalog/simple-search-form";
import { Container, PageHeader } from "@/src/components/layout/page-shell";
import { Reveal } from "@/src/components/motion/reveal";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { fetchAuthors } from "@/src/lib/catalog";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Auteurs",
  description: "Les écrivains, enseignants et chercheurs qui publient sur GeBook.",
  alternates: { canonical: "/auteurs" },
};

export default async function AuthorsPage(props: PageProps<"/auteurs">) {
  const searchParams = await props.searchParams;
  const qParam = searchParams.q;
  const q = (Array.isArray(qParam) ? qParam[0] : qParam) ?? "";

  const authors = await fetchAuthors({ q: q || undefined });

  return (
    <Container className="pb-20">
      <PageHeader
        eyebrow="Les voix de GeBook"
        title="Les auteurs de la maison"
        description="Écrivains, enseignants et chercheurs. Chaque fiche donne accès à l’ensemble de leurs ouvrages publiés."
      />

      <SimpleSearchForm
        action="/auteurs"
        label="Rechercher un auteur"
        placeholder="Nom de plume"
        initialQuery={q}
      />

      {authors.length === 0 ? (
        <EmptyState
          title={
            q
              ? "Aucun auteur ne correspond à cette recherche"
              : "Aucun auteur n’est publié pour le moment"
          }
          description={
            q
              ? "Essayez un autre nom de plume."
              : "Les premières fiches d’auteur arriveront avec les prochaines publications."
          }
        >
          <Button asChild variant="outline">
            <Link href={q ? "/auteurs" : "/livres"}>
              {q ? "Réinitialiser la recherche" : "Voir le catalogue"}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <Reveal
          as="ul"
          stagger={0.06}
          className="divide-border grid divide-y sm:grid-cols-2 sm:gap-x-12 sm:divide-y-0 lg:grid-cols-2"
        >
          {authors.map((author) => (
            <li key={author.id} className="border-border py-8 sm:border-t">
              <AuthorCard author={author} />
            </li>
          ))}
        </Reveal>
      )}
    </Container>
  );
}
