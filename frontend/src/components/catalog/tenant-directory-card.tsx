import Image from "next/image";
import Link from "next/link";

import { resolveAssetUrl } from "@/src/lib/assets";
import { TENANT_TYPE_LABELS } from "@/src/lib/tenant-type";
import type { TenantPublicSummary } from "@/src/lib/tenant-public";

/**
 * Fiche d'un espace dans l'annuaire public (`/espaces`).
 *
 * Même composition que `AuthorCard` (portrait ou initiales, nom, méta,
 * description tronquée) : les deux répertoires — auteurs, espaces —
 * doivent se lire comme une seule famille de pages, pas deux styles
 * différents pour la même idée de « fiche découverte ».
 */
export function TenantDirectoryCard({ tenant }: { tenant: TenantPublicSummary }) {
  return (
    <article className="group relative flex gap-4">
      <TenantLogo tenant={tenant} />

      <div className="min-w-0 flex-1">
        <h3 className="type-h3 text-secondary">
          <Link
            href={`/espaces/${tenant.slug}`}
            className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary transition-colors duration-[--duration-fast]"
          >
            {tenant.name}
          </Link>
        </h3>

        <p className="type-meta mt-0.5">
          {TENANT_TYPE_LABELS[tenant.type] ?? tenant.type}
        </p>

        {tenant.description && (
          <p className="text-muted-foreground mt-2.5 line-clamp-3 text-sm leading-relaxed text-pretty">
            {tenant.description}
          </p>
        )}
      </div>
    </article>
  );
}

function TenantLogo({ tenant }: { tenant: TenantPublicSummary }) {
  if (tenant.logoPath) {
    return (
      <Image
        src={resolveAssetUrl(tenant.logoPath)!}
        alt=""
        width={128}
        height={128}
        className="ring-border size-16 shrink-0 rounded-full object-cover ring-1"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-paper-200 text-ink-600 font-heading grid size-16 shrink-0 place-items-center rounded-full text-lg"
    >
      {tenant.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
