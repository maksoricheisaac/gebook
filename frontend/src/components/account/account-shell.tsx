import { Container } from "@/src/components/layout/page-shell";
import type { CurrentUser } from "@/src/lib/auth-shared";
import { getTenantMemberships } from "@/src/lib/tenant";
import { AccountNav } from "./account-nav";

/**
 * Coquille de l'espace lecteur.
 *
 * Un bandeau d'identité, une navigation persistante, puis le contenu. Les deux
 * pages du compte n'avaient auparavant aucune structure commune : un titre, un
 * paragraphe, et un bouton « Déconnexion » posé en bas de page.
 */
export async function AccountShell({
  user,
  title,
  description,
  actions,
  children,
}: {
  user: CurrentUser;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const memberships = await getTenantMemberships();
  // Un platform_admin accède à `/admin` sans jamais être membre d'un tenant
  // (RLS le laisse tout voir directement) : sans ce cas, un compte
  // administrateur pur ne verrait jamais ce lien alors qu'il vient de s'en
  // servir pour arriver ici.
  const hasTenantAccess =
    memberships.some((m) => m.status === "active") || user.roles.includes("admin");

  return (
    <>
      <div className="bg-paper-100 border-border border-b">
        <Container size="wide" className="py-8 sm:py-10">
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden
              className="bg-secondary text-secondary-foreground font-heading grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold"
            >
              {user.firstName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="type-label text-muted-foreground">Mon espace</p>
              <p className="type-h3 text-secondary truncate">{fullName}</p>
            </div>
          </div>
        </Container>
      </div>

      <Container size="wide" className="py-10 pb-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-14">
          <AccountNav
            hasTenantAccess={hasTenantAccess}
            isAuthor={user.roles.includes("author")}
          />

          <div className="min-w-0">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="type-h2 text-secondary">{title}</h1>
                {description && (
                  <p className="text-muted-foreground mt-2 text-[0.9375rem] text-pretty">
                    {description}
                  </p>
                )}
              </div>
              {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
            </div>

            {children}
          </div>
        </div>
      </Container>
    </>
  );
}
