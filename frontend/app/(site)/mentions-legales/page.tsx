import type { Metadata } from "next";

import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Informations légales relatives à l’éditeur et à l’hébergeur du site GeBook.",
  alternates: { canonical: "/mentions-legales" },
};

/**
 * Brouillon : les champs [À COMPLÉTER] doivent être remplis avec l’identité
 * réelle de la société avant mise en ligne, et le texte relu par un juriste.
 * Aucune information de ce type n’existait dans le dépôt au moment de la
 * rédaction (raison sociale, SIRET/RCCM, siège social...).
 */
export default function MentionsLegalesPage() {
  return (
    <Container size="narrow" className="pb-20">
      <PageHeader eyebrow="Informations légales" title="Mentions légales" />

      <div className="prose-editorial text-foreground/85 space-y-8">
        <section>
          <h2 className="type-h2 text-secondary">Éditeur du site</h2>
          <p>
            Le site GeBook est édité par [À COMPLÉTER — raison sociale], [À COMPLÉTER —
            forme juridique], au capital de [À COMPLÉTER] FCFA, immatriculée sous le
            numéro [À COMPLÉTER — SIRET/RCCM], dont le siège social est situé [À COMPLÉTER
            — adresse complète].
          </p>
          <p>Numéro de TVA intracommunautaire (le cas échéant) : [À COMPLÉTER].</p>
          <p>Directeur de la publication : [À COMPLÉTER — nom, qualité].</p>
          <p>
            Contact : <a href="mailto:contact@gebook.com">contact@gebook.com</a> ·{" "}
            <a href="tel:+242061234567">+242 06 123 45 67</a>
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Hébergement</h2>
          <p>
            Le site est hébergé par [À COMPLÉTER — raison sociale de l’hébergeur], [À
            COMPLÉTER — adresse de l’hébergeur].
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Nature de la plateforme</h2>
          <p>
            GeBook est une place de marché numérique : elle met en relation des lecteurs
            avec des maisons d’édition, des collectifs et des auteurs indépendants (« les
            espaces »), qui restent chacun responsables du contenu, de la description et
            de la vente de leurs propres œuvres. GeBook agit en qualité d’intermédiaire
            technique et commercial ; les conditions de vente propres à chaque achat sont
            précisées dans nos{" "}
            <a href="/cgv" className="text-primary hover:underline">
              conditions générales de vente
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Propriété intellectuelle</h2>
          <p>
            L’ensemble des éléments composant le site GeBook (structure, textes, logos,
            charte graphique) est protégé par le droit de la propriété intellectuelle. Les
            œuvres proposées à la vente restent la propriété de leurs auteurs et ayants
            droit respectifs, qui en conservent l’intégralité des droits.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">Médiation et litiges</h2>
          <p>
            En cas de litige, l’utilisateur peut d’abord contacter GeBook via{" "}
            <a href="/contact" className="text-primary hover:underline">
              notre page de contact
            </a>
            . À défaut de résolution amiable, [À COMPLÉTER — juridiction compétente /
            dispositif de médiation applicable].
          </p>
        </section>
      </div>
    </Container>
  );
}
