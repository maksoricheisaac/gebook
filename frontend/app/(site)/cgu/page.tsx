import type { Metadata } from "next";

import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Conditions générales d’utilisation",
  description:
    "Règles d’utilisation de la plateforme GeBook pour les lecteurs et les espaces éditoriaux.",
  alternates: { canonical: "/cgu" },
};

/**
 * Brouillon : les champs [À COMPLÉTER] doivent être remplis avant mise en
 * ligne, et le texte relu par un juriste. Distinct des CGV : ce document régit
 * l’usage de la plateforme (comptes, contenus, comportement), pas l’achat.
 */
export default function CguPage() {
  return (
    <Container size="narrow" className="pb-20">
      <PageHeader
        eyebrow="Contrat"
        title="Conditions générales d’utilisation"
        description="Dernière mise à jour : [À COMPLÉTER — date]."
      />

      <div className="prose-editorial text-foreground/85 space-y-8">
        <section>
          <h2 className="type-h2 text-secondary">1. Objet</h2>
          <p>
            Les présentes conditions générales d’utilisation (CGU) régissent l’accès et
            l’usage de la plateforme GeBook, éditée par [À COMPLÉTER — raison sociale]
            (voir nos{" "}
            <a href="/mentions-legales" className="text-primary hover:underline">
              mentions légales
            </a>
            ), par toute personne y créant un compte, qu’il s’agisse d’un lecteur ou d’un
            espace éditorial (maison d’édition, collectif, auteur indépendant).
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">2. Comptes</h2>
          <p>
            La création d’un compte lecteur est gratuite et ouverte à toute personne
            physique. La création d’un espace éditorial est un acte volontaire et gratuit
            ; son créateur en devient automatiquement propriétaire (« owner ») et peut y
            inviter d’autres membres avec des rôles distincts.
          </p>
          <p>
            Chaque utilisateur est responsable de la confidentialité de ses identifiants
            et de toute activité effectuée depuis son compte.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">3. Contenus publiés par les espaces</h2>
          <p>
            Chaque espace est seul responsable des œuvres qu’il publie : exactitude des
            descriptions, droits de reproduction et de diffusion, conformité du contenu à
            la loi applicable. GeBook se réserve le droit de retirer tout contenu
            manifestement illicite ou contraire aux présentes CGU, sans préavis en cas
            d’urgence.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">4. Usages interdits</h2>
          <p>
            Il est interdit d’utiliser la plateforme pour diffuser un contenu illicite,
            porter atteinte aux droits d’un tiers, contourner les mesures de protection
            des fichiers achetés, ou perturber le fonctionnement du service.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">5. Suspension et résiliation</h2>
          <p>
            GeBook peut suspendre ou clôturer un compte en cas de manquement grave aux
            présentes CGU, après information de l’utilisateur sauf urgence avérée. Chaque
            utilisateur peut demander la clôture de son compte via{" "}
            <a href="/contact" className="text-primary hover:underline">
              notre page de contact
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">6. Évolution des CGU</h2>
          <p>
            GeBook peut modifier les présentes CGU ; toute modification substantielle est
            annoncée aux utilisateurs concernés avant son entrée en vigueur.
          </p>
        </section>

        <section>
          <h2 className="type-h2 text-secondary">7. Droit applicable</h2>
          <p>[À COMPLÉTER — droit applicable et juridiction compétente].</p>
        </section>
      </div>
    </Container>
  );
}
