import type { Metadata } from "next";

import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment GeBook collecte, utilise et protège les données personnelles de ses utilisateurs.",
  alternates: { canonical: "/confidentialite" },
};

/**
 * Brouillon : les champs [À COMPLÉTER] doivent être remplis avant mise en
 * ligne, et le texte relu par un juriste. Les données listées reflètent ce
 * que le produit collecte réellement (compte, commande, bibliothèque) — à
 * revoir si le modèle de données change.
 */
export default function ConfidentialitePage() {
  return (
    <Container size="narrow" className="pb-20">
      <PageHeader
        eyebrow="Vos données"
        title="Politique de confidentialité"
        description="Dernière mise à jour : [À COMPLÉTER — date]."
      />

      <div className="prose-editorial text-foreground/85 space-y-8">
        <section>
          <h2 className="type-h2 text-secondary">1. Responsable du traitement</h2>
          <p>
            [À COMPLÉTER — raison sociale] (voir nos{" "}
            <a href="/mentions-legales" className="text-primary hover:underline">
              mentions légales
            </a>
            ) est responsable du traitement des données personnelles collectées sur
            GeBook. Pour toute question, contactez{" "}
            <a href="mailto:contact@gebook.com">contact@gebook.com</a>.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">2. Données collectées</h2>
          <p>Selon votre usage de la plateforme, nous collectons :</p>
          <ul>
            <li>Identité et contact : nom, prénom, adresse e-mail, téléphone.</li>
            <li>
              Données de commande : historique d’achat, adresse de livraison le cas
              échéant.
            </li>
            <li>
              Données techniques de sécurité : adresse IP, horodatage des connexions et
              tentatives de connexion (utilisées pour la protection contre les abus).
            </li>
            <li>
              Si vous créez un espace éditorial : les informations de cet espace (nom,
              description, membres invités).
            </li>
          </ul>
          <p>
            Nous ne collectons jamais vos données de carte bancaire : le paiement est
            traité directement par notre prestataire de paiement.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">3. Finalités</h2>
          <p>
            Ces données servent à créer et gérer votre compte, traiter vos commandes, vous
            donner accès à votre bibliothèque numérique, assurer la sécurité de la
            plateforme (lutte contre la fraude et les accès non autorisés) et vous
            contacter au sujet de votre compte ou de vos commandes.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">4. Partage des données</h2>
          <p>
            Les données strictement nécessaires à l’exécution d’une commande (nom, contenu
            de la commande) sont partagées avec l’espace éditorial vendeur. Nos
            prestataires techniques (hébergement, envoi d’e-mails, paiement) accèdent aux
            données nécessaires à leur mission, dans le cadre d’un contrat qui les engage
            à la confidentialité. Nous ne vendons aucune donnée personnelle.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">5. Durée de conservation</h2>
          <p>
            Les données de compte sont conservées tant que le compte est actif. Les
            données de commande sont conservées [À COMPLÉTER — durée], notamment à des
            fins comptables. [À COMPLÉTER — précisions complémentaires].
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">6. Vos droits</h2>
          <p>
            Conformément à la réglementation applicable, vous disposez d’un droit d’accès,
            de rectification, d’effacement et de portabilité de vos données, ainsi que
            d’un droit d’opposition. Pour l’exercer, contactez{" "}
            <a href="mailto:contact@gebook.com">contact@gebook.com</a>.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">7. Cookies</h2>
          <p>
            Voir notre{" "}
            <a href="/cookies" className="text-primary hover:underline">
              politique de cookies
            </a>{" "}
            pour le détail des traceurs utilisés.
          </p>
        </section>
      </div>
    </Container>
  );
}
