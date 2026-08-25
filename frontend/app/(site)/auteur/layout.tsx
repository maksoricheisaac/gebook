import { TenantProvider } from "@/src/components/providers/tenant-provider";
import { requireUser } from "@/src/lib/auth";
import { resolveActiveTenant } from "@/src/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Coquille de l'espace tenant-scoped (Phase 5).
 *
 * `/auteur/*` est aujourd'hui la seule surface où un utilisateur agit *dans*
 * un tenant particulier — c'est donc là que `TenantProvider` est monté.
 * Volontairement générique et sans dépendance au sous-domaine : quand
 * `app.gebook.com` existera, ce même provider s'y déplacera sans changer de
 * forme (brief §5, architecture cible).
 *
 * Les adhésions et le tenant actif sont résolus ici, côté serveur — le
 * provider n'a donc rien à recharger au montage, et une page enfant peut
 * s'appuyer sur `useTenant()` dès le premier rendu client.
 */
export default async function AuteurLayout({ children }: LayoutProps<"/auteur">) {
  await requireUser("/auteur/tableau-de-bord");
  const { memberships, activeTenant } = await resolveActiveTenant();

  return (
    <TenantProvider
      memberships={memberships}
      initialActiveTenantId={activeTenant?.tenantId ?? null}
    >
      {children}
    </TenantProvider>
  );
}
