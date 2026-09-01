import Link from "next/link";
import type { Metadata } from "next";
import { BookMarked, Feather, Globe, Handshake, type LucideIcon } from "lucide-react";

import { Container, PageHeader, SectionHeader } from "@/src/components/layout/page-shell";
import { Reveal } from "@/src/components/motion/reveal";
import { Button } from "@/src/components/ui/button";

export const metadata: Metadata = {
  title: "La plateforme",
  description:
    "GeBook : la plateforme qui réunit éditeurs, collectifs et auteurs indépendants africains sur une seule librairie numérique.",
  alternates: { canonical: "/a-propos" },
};

const VALUES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Feather,
    title: "Éditer",
    description:
      "Accompagner des œuvres utiles et exigeantes, de la relecture à la mise en forme finale.",
  },
  {
    icon: Globe,
    title: "Rayonner",
    description:
      "Donner aux voix africaines une diffusion qui ne dépend pas d’un point de vente physique.",
  },
  {
    icon: BookMarked,
    title: "Transmettre",
    description:
      "Rendre les savoirs accessibles, dans des formats adaptés aux usages et aux connexions locales.",
  },
  {
    icon: Handshake,
    title: "Partager",
    description:
      "Construire une relation juste avec les auteurs, avec une part clairement établie sur chaque vente.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Container size="wide">
        <PageHeader
          eyebrow="La plateforme"
          title="Publier, vendre et faire rayonner les voix africaines."
          description="GeBook réunit éditeurs, collectifs et auteurs indépendants d’Afrique sur une seule plateforme. Elle rapproche les auteurs de leurs lecteurs, dans tous les formats de lecture."
        />
      </Container>

      <Container size="wide" className="pb-20">
        <section className="border-border grid gap-12 border-t pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <p className="type-label rule-accent text-muted-foreground">Notre histoire</p>
            <h2 className="type-h2 text-secondary">
              Une librairie numérique, mais d’abord un projet culturel.
            </h2>
            <div className="prose-editorial text-foreground/85 mt-6">
              <p>
                GeBook veut simplifier la découverte, l’achat et la lecture d’ouvrages
                africains. La plateforme réunit déjà plusieurs éditeurs et auteurs
                indépendants, et s’ouvre progressivement à d’autres maisons et collectifs
                congolais et africains.
              </p>
              <p>
                Notre ambition est de construire une distribution éditoriale durable,
                accessible et adaptée aux réalités locales : des formats légers, des
                moyens de paiement d’ici, et des prix pensés pour le lectorat auquel ces
                livres s’adressent.
              </p>
            </div>
          </div>

          <Reveal as="ul" stagger={0.07} className="grid gap-8 sm:grid-cols-2">
            {VALUES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="border-border border-t pt-5">
                <Icon aria-hidden className="text-primary size-5" />
                <h3 className="type-h3 text-secondary mt-3">{title}</h3>
                <p className="text-muted-foreground mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">
                  {description}
                </p>
              </li>
            ))}
          </Reveal>
        </section>
      </Container>

      <section className="bg-paper-100 border-border border-y">
        <Container size="wide" className="py-16 sm:py-20">
          <SectionHeader
            eyebrow="Ce que nous construisons"
            title="Une plateforme, pas une page de vente"
            description="GeBook se construit par étapes. Voici honnêtement où nous en sommes."
          />

          <Reveal as="ul" stagger={0.06} className="grid gap-6 md:grid-cols-3">
            <Milestone
              state="done"
              title="Catalogue et commandes"
              description="Le catalogue, la recherche, les fiches d’œuvre et l’enregistrement des commandes fonctionnent."
            />
            <Milestone
              state="progress"
              title="Paiement en ligne"
              description="Le socle est en place. Le raccordement à un prestataire réel — Mobile Money d’abord — est en cours."
            />
            <Milestone
              state="next"
              title="Bibliothèque du lecteur"
              description="L’accès aux fichiers achetés et leur téléchargement sécurisé viendront ensuite."
            />
          </Reveal>
        </Container>
      </section>

      <Container size="wide" className="py-16 sm:py-24">
        <div className="bg-muted border-border paper-grain relative overflow-hidden rounded-xl border px-6 py-16 text-center sm:px-14">
          <div aria-hidden className="bg-accent absolute inset-x-0 top-0 h-0.5" />
          <h2 className="type-h1 text-secondary mx-auto max-w-2xl">
            Faire de chaque livre une passerelle entre un auteur, une culture et ses
            lecteurs.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/livres">Explorer le catalogue</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Nous écrire</Link>
            </Button>
          </div>
        </div>
      </Container>
    </>
  );
}

/**
 * Étape du projet.
 *
 * La pastille d'état est doublée d'un libellé texte : la couleur seule ne doit
 * jamais porter l'information.
 */
function Milestone({
  state,
  title,
  description,
}: {
  state: "done" | "progress" | "next";
  title: string;
  description: string;
}) {
  const labels = {
    done: { text: "En service", dot: "bg-primary" },
    progress: { text: "En cours", dot: "bg-accent" },
    next: { text: "À venir", dot: "bg-ink-300" },
  } as const;

  const { text, dot } = labels[state];

  return (
    <li className="border-border bg-card rounded-lg border p-6">
      <p className="type-label text-muted-foreground flex items-center gap-2">
        <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
        {text}
      </p>
      <h3 className="type-h3 text-secondary mt-3">{title}</h3>
      <p className="text-muted-foreground mt-2 text-[0.9375rem] leading-relaxed text-pretty">
        {description}
      </p>
    </li>
  );
}
