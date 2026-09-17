import type { Metadata } from "next";

import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description:
    "Conditions applicables à l’achat d’ouvrages numériques et imprimés sur GeBook.",
  alternates: { canonical: "/cgv" },
};

/**
 * Brouillon : les champs [À COMPLÉTER] doivent être remplis avant mise en
 * ligne, et le texte relu par un juriste. Décrit le fonctionnement réel du
 * panier/checkout/bibliothèque tel qu’implémenté (pas une description
 * générique) : ne pas modifier sans vérifier que le code correspond encore.
 */
export default function CgvPage() {
  return (
    <Container size="narrow" className="pb-20">
      <PageHeader
        eyebrow="Contrat"
        title="Conditions générales de vente"
        description="Dernière mise à jour : [À COMPLÉTER — date]."
      />

      <div className="prose-editorial text-foreground/85 space-y-8">
        <section>
          <h2 className="type-h2 text-secondary">1. Rôle de GeBook</h2>
          <p>
            GeBook est une place de marché : chaque œuvre vendue appartient à un espace
            éditorial (maison d’édition, collectif ou auteur indépendant) qui reste seul
            vendeur au sens juridique. Une même commande peut inclure des œuvres de
            plusieurs espaces différents ; chacun n’est responsable que de ses propres
            articles.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">2. Formats et livraison</h2>
          <p>
            Une œuvre peut être proposée en version numérique (téléchargement immédiat
            après paiement, accessible depuis la bibliothèque du compte) ou en version
            imprimée (livraison à domicile ou retrait sur place, selon ce que l’espace
            éditorial a configuré pour ce format). Les frais et délais de livraison
            physique, lorsqu’ils s’appliquent, sont indiqués avant la validation de la
            commande.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">3. Prix et paiement</h2>
          <p>
            Les prix affichés sont ceux en vigueur au moment de la commande, en FCFA. Le
            montant réellement facturé est toujours celui calculé par nos serveurs au
            moment du paiement, indépendamment de toute valeur affichée côté navigateur.
            Le paiement est géré par un prestataire tiers ; GeBook ne stocke aucune donnée
            de carte bancaire.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">4. Annulation</h2>
          <p>
            Une commande peut être annulée par l’acheteur tant qu’elle n’a pas encore été
            payée, depuis la page « Mes commandes ». Une fois le paiement confirmé,
            l’annulation n’est plus possible par ce moyen ; voir « Remboursement »
            ci-dessous.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">
            5. Droit de rétractation et remboursement
          </h2>
          <p>
            Conformément à la réglementation applicable aux contenus numériques fournis
            sur support immatériel, le droit de rétractation peut ne pas s’appliquer dès
            lors que le téléchargement a commencé avec l’accord exprès du client — voir [À
            COMPLÉTER — texte de loi applicable]. Un remboursement reste possible à la
            discrétion de GeBook ou de l’espace éditorial concerné, notamment en cas de
            fichier défectueux ; il révoque alors l’accès à l’ouvrage concerné. Toute
            demande passe par{" "}
            <a href="/contact" className="text-primary hover:underline">
              notre page de contact
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">6. Accès à la bibliothèque numérique</h2>
          <p>
            L’accès à un ouvrage numérique acheté est personnel et non transférable. Il
            peut être révoqué en cas de remboursement ou de fraude avérée sur le moyen de
            paiement utilisé.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">7. Réclamations</h2>
          <p>
            Toute réclamation relative à une commande peut être adressée via{" "}
            <a href="/contact" className="text-primary hover:underline">
              notre page de contact
            </a>
            . [À COMPLÉTER — droit applicable et juridiction compétente en cas de litige].
          </p>
        </section>
      </div>
    </Container>
  );
}
