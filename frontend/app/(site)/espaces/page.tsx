import Link from "next/link";
import type { Metadata } from "next";

import { SimpleSearchForm } from "@/src/components/catalog/simple-search-form";
import { TenantDirectoryCard } from "@/src/components/catalog/tenant-directory-card";
import { Container, PageHeader } from "@/src/components/layout/page-shell";
import { Reveal } from "@/src/components/motion/reveal";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/states";
import { fetchTenantsPublic } from "@/src/lib/tenant-public";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espaces",
  description:
    "Les maisons d’édition, auteurs indépendants et collectifs qui publient sur GeBook.",
  alternates: { canonical: "/espaces" },
};

/**
 * Annuaire public des espaces — jusqu'ici introuvable sans connaître déjà
 * l'adresse exacte d'une vitrine (`/espaces/[slug]`, qui existe depuis la
 * Phase 5 mais n'avait aucun point d'entrée : ni lien de navigation, ni
 * page de liste). Même structure que `/auteurs`, l'autre répertoire de
 * découverte du site.
 */
export default async function TenantsDirectoryPage(props: PageProps<"/espaces">) {
  const searchParams = await props.searchParams;
  const qParam = searchParams.q;
  const q = (Array.isArray(qParam) ? qParam[0] : qParam) ?? "";

  const tenants = await fetchTenantsPublic(q || undefined);

  return (
    <Container className="pb-20">
      <PageHeader
        eyebrow="Qui publie sur GeBook"
        title="Les espaces de la plateforme"
        description="Maisons d’édition, auteurs indépendants, collectifs et organisations culturelles. Chaque espace a sa propre vitrine et son propre catalogue."
      />

      <SimpleSearchForm
        action="/espaces"
        label="Rechercher un espace"
        placeholder="Nom de l’espace"
        initialQuery={q}
      />

      {tenants.length === 0 ? (
        <EmptyState
          title={
            q
              ? "Aucun espace ne correspond à cette recherche"
              : "Aucun espace n’est publié pour le moment"
          }
          description={
            q
              ? "Essayez un autre mot-clé."
              : "Les premiers espaces arriveront avec les prochaines publications."
          }
        >
          <Button asChild variant="outline">
            <Link href={q ? "/espaces" : "/livres"}>
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
          {tenants.map((tenant) => (
            <li key={tenant.slug} className="border-border py-8 sm:border-t">
              <TenantDirectoryCard tenant={tenant} />
            </li>
          ))}
        </Reveal>
      )}
    </Container>
  );
}
