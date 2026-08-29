import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Globe, Link2 } from "lucide-react";

import { AuthorCard } from "@/src/components/catalog/author-card";
import { BookGrid } from "@/src/components/catalog/book-grid";
import { Breadcrumb, Container, SectionHeader } from "@/src/components/layout/page-shell";
import { ApiError } from "@/src/lib/api";
import { resolveAssetUrl } from "@/src/lib/assets";
import { fetchAuthors, fetchWorks } from "@/src/lib/catalog";
import {
  fetchTenantPublicProfile,
  type TenantPublicProfile,
} from "@/src/lib/tenant-public";
import { TENANT_TYPE_LABELS } from "@/src/lib/tenant-type";

/** Voir la note dans `app/(site)/page.tsx` : la CI construit sans API active. */
export const dynamic = "force-dynamic";

async function loadTenant(slug: string): Promise<TenantPublicProfile> {
  try {
    return await fetchTenantPublicProfile(slug);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata(
  props: PageProps<"/espaces/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;

  try {
    const tenant = await fetchTenantPublicProfile(slug);
    const description =
      tenant.description ?? `Les œuvres publiées par ${tenant.name} sur GeBook.`;

    return {
      title: tenant.name,
      description,
      alternates: { canonical: `/espaces/${tenant.slug}` },
      openGraph: { type: "website", title: tenant.name, description },
    };
  } catch {
    return {};
  }
}

/**
 * Vitrine publique d'un tenant (Phase 5).
 *
 * Même structure que la fiche d'auteur (`/auteurs/[slug]`) : en-tête
 * (logo, nom, description, liens) puis les listes qui en dépendent — ici
 * auteurs et œuvres de l'espace plutôt qu'une seule bibliographie.
 *
 * `fetchWorks({ tenant: slug })` inclut aussi les œuvres `tenant_only` de cet
 * espace (contrairement au catalogue agrégé) : c'est très exactement ce que
 * cette visibilité est censée vouloir dire.
 */
export default async function TenantStorefrontPage(props: PageProps<"/espaces/[slug]">) {
  const { slug } = await props.params;
  const tenant = await loadTenant(slug);
  const [authors, works] = await Promise.all([
    fetchAuthors(slug),
    fetchWorks({ tenant: slug, perPage: 24 }),
  ]);

  const socialEntries = Object.entries(tenant.socialLinks ?? {}).filter(([, href]) =>
    href?.trim(),
  );

  return (
    <Container size="wide" className="pb-20">
      <div className="pt-8">
        <Breadcrumb items={[{ href: "/", label: "Accueil" }, { label: tenant.name }]} />
      </div>

      <section className="border-border grid gap-8 border-b pb-12 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <TenantLogo tenant={tenant} />

        <div className="min-w-0">
          <p className="type-label rule-accent text-muted-foreground">
            {TENANT_TYPE_LABELS[tenant.type] ?? tenant.type}
          </p>
          <h1 className="type-h1 text-secondary">{tenant.name}</h1>

          {tenant.description && (
            <div className="prose-editorial text-foreground/85 mt-6">
              {tenant.description}
            </div>
          )}

          {(tenant.website || socialEntries.length > 0) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {tenant.website && (
                <ExternalLink href={tenant.website} label="Site web" icon={Globe} />
              )}
              {socialEntries.map(([network, href]) => (
                <ExternalLink
                  key={network}
                  href={href}
                  label={network[0].toUpperCase() + network.slice(1)}
                  icon={Link2}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {authors.length > 0 && (
        <section className="border-border mt-14 border-b pb-14">
          <SectionHeader eyebrow="Équipe éditoriale" title="Les auteurs de cet espace" />
          <div className="grid gap-8 sm:grid-cols-2">
            {authors.map((author) => (
              <AuthorCard key={author.id} author={author} variant="compact" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <SectionHeader eyebrow="Catalogue" title={`Les œuvres de ${tenant.name}`} />
        <BookGrid
          works={works.data}
          priorityCount={4}
          emptyTitle="Aucune œuvre publiée pour le moment"
          emptyDescription="Les publications de cet espace apparaîtront ici dès leur mise en ligne."
        />
      </section>
    </Container>
  );
}

function TenantLogo({ tenant }: { tenant: TenantPublicProfile }) {
  if (tenant.logoPath) {
    return (
      <Image
        src={resolveAssetUrl(tenant.logoPath)!}
        alt=""
        width={320}
        height={320}
        priority
        className="ring-border bg-paper-100 size-40 shrink-0 rounded-full object-cover ring-1 sm:size-44"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-paper-200 text-ink-600 font-heading grid size-40 shrink-0 place-items-center rounded-full text-4xl sm:size-44"
    >
      {tenant.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ExternalLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Globe;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="border-border text-secondary hover:border-primary/40 hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors"
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </a>
  );
}
