import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Library, Rocket } from "lucide-react";

import { AccountShell } from "@/src/components/account/account-shell";
import { InvitationAcceptCard } from "@/src/components/account/invitation-accept-card";
import { Button } from "@/src/components/ui/button";
import { OrderStatusBadge, isPayable } from "@/src/lib/order-status";
import { requireRole } from "@/src/lib/auth";
import { formatDate, formatPrice } from "@/src/lib/format";
import { canDownload, fetchMyLibrary } from "@/src/lib/library";
import { fetchMyOrders } from "@/src/lib/orders";
import { getTenantMemberships } from "@/src/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

/**
 * Vue d'ensemble du lecteur.
 *
 * Elle répond à trois questions : où en sont mes commandes, qu'est-ce que je
 * peux faire maintenant, et qu'est-ce qui arrive ensuite. La version précédente
 * n'affichait qu'un message d'attente et un lien.
 */
export default async function ReaderSpacePage() {
  const user = await requireRole(["reader", "admin"], "/mon-espace");
  const [orders, library, memberships] = await Promise.all([
    fetchMyOrders(1),
    fetchMyLibrary(1),
    getTenantMemberships(),
  ]);

  const recent = orders.data.slice(0, 3);
  const toSettle = orders.data.filter((order) => isPayable(order.status));
  const readable = library.data.filter(canDownload);
  // Voir le commentaire équivalent dans `account-shell.tsx` : un platform_admin
  // n'est jamais membre d'un tenant, mais accède à `/admin` tout de même.
  const hasTenantAccess =
    memberships.some((m) => m.status === "active") || user.roles.includes("admin");
  const pendingInvitations = memberships.filter((m) => m.status === "invited");

  return (
    <AccountShell
      user={user}
      title={`Bonjour, ${user.firstName}.`}
      description="Voici l’état de vos commandes et ce que vous pouvez faire depuis votre compte."
      actions={
        <Button asChild variant="outline">
          <Link href="/livres">Parcourir le catalogue</Link>
        </Button>
      }
    >
      <div className="space-y-10">
        <dl className="grid gap-4 sm:grid-cols-3">
          <SummaryTile
            label="Commandes"
            value={String(orders.meta.total)}
            hint="depuis la création du compte"
          />
          <SummaryTile
            label="En attente de règlement"
            value={String(toSettle.length)}
            hint={toSettle.length > 0 ? "à finaliser" : "rien à régler"}
            emphasis={toSettle.length > 0}
          />
          <SummaryTile
            label="Bibliothèque"
            value={String(library.meta.total)}
            hint={
              library.meta.total === 0
                ? "aucun ouvrage pour l’instant"
                : `${readable.length} téléchargeable${readable.length > 1 ? "s" : ""}`
            }
          />
        </dl>

        {pendingInvitations.length > 0 && (
          <section className="border-accent/40 bg-accent-muted/50 rounded-lg border p-5">
            <h2 className="type-h3 text-secondary">
              {pendingInvitations.length > 1
                ? `${pendingInvitations.length} invitations à rejoindre une équipe`
                : "Une invitation à rejoindre une équipe"}
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Acceptez pour accéder à l’espace éditeur avec le rôle proposé.
            </p>
            <ul className="mt-4 space-y-3">
              {pendingInvitations.map((membership) => (
                <InvitationAcceptCard key={membership.tenantId} membership={membership} />
              ))}
            </ul>
          </section>
        )}

        {toSettle.length > 0 && (
          <section className="border-accent/40 bg-accent-muted/50 rounded-lg border p-5">
            <h2 className="type-h3 text-secondary">
              {toSettle.length > 1
                ? `${toSettle.length} commandes attendent leur règlement`
                : "Une commande attend son règlement"}
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Vos exemplaires sont réservés. Le règlement se fait depuis la page de la
              commande.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/paiement/${toSettle[0]!.orderNumber}`}>
                Régler la commande {toSettle[0]!.orderNumber}
              </Link>
            </Button>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="type-h3 text-secondary">Dernières commandes</h2>
            {orders.data.length > 0 && (
              <Link
                href="/mes-commandes"
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Tout voir
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="border-border-strong bg-card rounded-lg border border-dashed p-8 text-center">
              <BookOpen aria-hidden className="text-ink-300 mx-auto size-8" />
              <p className="text-secondary mt-3 font-semibold">
                Aucune commande pour le moment
              </p>
              <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm text-pretty">
                Vos achats apparaîtront ici avec leur numéro et leur statut.
              </p>
              <Button asChild className="mt-5">
                <Link href="/livres">Découvrir le catalogue</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-border border-border divide-y rounded-lg border">
              {recent.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/paiement/${order.orderNumber}`}
                    className="hover:bg-paper-100/70 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors duration-[--duration-fast]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-secondary block text-sm font-semibold">
                        {order.orderNumber}
                      </span>
                      <span className="type-meta">
                        {formatDate(order.createdAt)} ·{" "}
                        {order.items.length > 1
                          ? `${order.items.length} articles`
                          : (order.items[0]?.workTitle ?? "1 article")}
                      </span>
                    </span>
                    <OrderStatusBadge status={order.status} />
                    <span className="text-secondary tnum w-24 text-right text-sm font-semibold">
                      {formatPrice(order.totalAmount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border border-t pt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="type-h3 text-secondary">Ma bibliothèque</h2>
            {library.meta.total > 0 && (
              <Link
                href="/bibliotheque"
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Tout voir
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>

          {library.meta.total === 0 ? (
            <p className="text-muted-foreground max-w-lg text-sm leading-relaxed text-pretty">
              Les ouvrages numériques que vous achetez s’ajoutent ici automatiquement, dès
              que le paiement est confirmé.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Library aria-hidden className="text-ink-300 size-4" />
                {readable.length > 0
                  ? `${readable.length} ouvrage${readable.length > 1 ? "s" : ""} prêt${readable.length > 1 ? "s" : ""} à télécharger.`
                  : "Vos ouvrages sont enregistrés ; aucun n’est téléchargeable pour le moment."}
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/bibliotheque">Ouvrir ma bibliothèque</Link>
              </Button>
            </>
          )}
        </section>

        <section className="border-border bg-paper-100 rounded-lg border p-6 sm:p-8">
          <div className="flex flex-wrap items-start gap-5 sm:flex-nowrap">
            <span
              aria-hidden
              className="bg-secondary text-secondary-foreground grid size-11 shrink-0 place-items-center rounded-full"
            >
              <Rocket aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              {hasTenantAccess ? (
                <>
                  <h2 className="type-h3 text-secondary">Votre espace éditeur</h2>
                  <p className="text-muted-foreground mt-1.5 max-w-lg text-sm leading-relaxed text-pretty">
                    Retrouvez vos œuvres, vos ventes et votre équipe depuis
                    l’administration de votre espace.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/admin">Accéder à mon espace éditeur</Link>
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="type-h3 text-secondary">
                    Vous êtes auteur ou éditeur ?
                  </h2>
                  <p className="text-muted-foreground mt-1.5 max-w-lg text-sm leading-relaxed text-pretty">
                    Ouvrez votre espace pour publier vos œuvres, suivre vos ventes et
                    inviter une équipe — gratuitement, en quelques informations.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/creer-un-espace">Créer mon espace</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </AccountShell>
  );
}

/**
 * Tuile de synthèse.
 *
 * Volontairement sobre et sans icône : trois tuiles identiques et colorées
 * seraient exactement le « tableau de bord SaaS générique » à éviter. Seule
 * celle qui appelle une action prend du poids.
 */
function SummaryTile({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "border-accent/40 bg-card rounded-lg border p-5"
          : "border-border bg-card rounded-lg border p-5"
      }
    >
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <span className="font-heading text-secondary tnum block text-3xl font-semibold">
          {value}
        </span>
        <span className="type-caption">{hint}</span>
      </dd>
    </div>
  );
}
