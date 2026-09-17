import type { Metadata } from "next";

import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Politique de cookies",
  description: "Les cookies utilisés par GeBook et leur finalité.",
  alternates: { canonical: "/cookies" },
};

/**
 * Reflète ce que le code pose réellement aujourd’hui (cookie de session
 * httpOnly, cookie de tenant actif) — pas une liste générique. Le panier
 * utilise `localStorage`, pas un cookie (voir `cart-provider.tsx`). Aucun
 * bandeau de consentement n’existe encore : cette page reste informative tant
 * qu’aucun cookie non essentiel (mesure d’audience, marketing) n’est posé.
 * `TURNSTILE_SECRET_KEY`/widget CAPTCHA, une fois câblé, pose un cookie
 * technique tiers (Cloudflare) au moment de l’inscription/connexion — à
 * ajouter ici si le tableau ci-dessous change.
 */
export default function CookiesPage() {
  return (
    <Container size="narrow" className="pb-20">
      <PageHeader
        eyebrow="Vos données"
        title="Politique de cookies"
        description="Dernière mise à jour : [À COMPLÉTER — date]."
      />

      <div className="prose-editorial text-foreground/85 space-y-8">
        <section>
          <h2 className="type-h2 text-secondary">Ce que nous utilisons aujourd’hui</h2>
          <p>
            GeBook n’utilise aucun cookie de mesure d’audience ni de publicité. Seuls des
            cookies strictement nécessaires au fonctionnement du service sont déposés :
          </p>
        </section>

        <section>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="py-2 pr-4">Cookie</th>
                <th className="py-2 pr-4">Finalité</th>
                <th className="py-2">Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-border border-b">
                <td className="py-2 pr-4 font-mono text-xs">gebook_session</td>
                <td className="py-2 pr-4">
                  Maintient votre connexion. Strictement nécessaire : sans lui, impossible
                  de rester connecté d’une page à l’autre.
                </td>
                <td className="py-2">30 jours</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-2 pr-4 font-mono text-xs">gebook_active_tenant</td>
                <td className="py-2 pr-4">
                  Retient l’espace éditorial actif lorsque vous gérez plusieurs espaces
                  depuis le même compte.
                </td>
                <td className="py-2">Session</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Le panier</h2>
          <p>
            Le contenu de votre panier n’est pas stocké dans un cookie : il reste dans la
            mémoire locale de votre navigateur (« localStorage »), propre à cet appareil,
            et n’est jamais transmis à nos serveurs avant la validation de la commande.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Cookies tiers</h2>
          <p>
            La protection anti-robot (Cloudflare Turnstile), affichée à l’inscription et à
            la connexion, peut déposer un cookie technique tiers le temps de la
            vérification. Elle ne sert à aucune finalité publicitaire.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Gestion</h2>
          <p>
            Les cookies strictement nécessaires ci-dessus ne peuvent pas être désactivés
            sans empêcher la connexion au service. Vous pouvez à tout moment les supprimer
            depuis les réglages de votre navigateur ; vous devrez alors vous reconnecter.
          </p>
        </section>
      </div>
    </Container>
  );
}
