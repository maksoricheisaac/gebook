import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Feather,
  Headphones,
  Library,
  Search,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { AuthorCard } from "@/src/components/catalog/author-card";
import { BookCard } from "@/src/components/catalog/book-card";
import { BookCover } from "@/src/components/catalog/book-cover";
import { BookGrid } from "@/src/components/catalog/book-grid";
import { Container, SectionHeader } from "@/src/components/layout/page-shell";
import { HeroVisual } from "@/src/components/motion/hero-visual";
import { Reveal } from "@/src/components/motion/reveal";
import { Button } from "@/src/components/ui/button";
import { fetchAuthors, fetchCategories, fetchWorks } from "@/src/lib/catalog";
import { formatNumber } from "@/src/lib/format";

/**
 * Rendu dynamique forcé : la CI construit le frontend sans backend actif (job
 * séparé du job API), et cette page dépend entièrement de PostgreSQL. La rendre
 * statique ferait échouer `next build` faute de pouvoir joindre l'API.
 */
export const dynamic = "force-dynamic";

/**
 * Accueil.
 *
 * Structure : ce qu'est GeBook → ce qu'on y trouve → comment on lit → comment on
 * achète → pourquoi un compte. Chaque section répond à une question que se pose
 * un visiteur qui arrive pour la première fois, dans l'ordre où il se la pose.
 *
 * Chaque chiffre et chaque vignette vient de PostgreSQL. La version PHP inventait
 * des statistiques (« +1000 livres », « +5000 lecteurs ») et un avis de lectrice
 * qui n'existait pas : aucun des deux ne survit à la migration, et rien n'est
 * réintroduit ici.
 */
export default async function HomePage() {
  const [featured, catalogTotal, categories, authors] = await Promise.all([
    fetchWorks({ featured: true, perPage: 8 }),
    fetchWorks({ perPage: 1 }),
    fetchCategories(),
    fetchAuthors(),
  ]);

  // Les catégories vides ne sont pas des portes : les proposer mène à une page
  // « aucun résultat », ce qui est la pire première impression du catalogue.
  const activeCategories = categories.filter((category) => category.workCount > 0);
  const spotlight = featured.data[0];
  const rest = featured.data.slice(1, 5);

  return (
    <>
      <Hero
        workCount={catalogTotal.meta.total}
        authorCount={authors.length}
        categoryCount={activeCategories.length}
      />

      {spotlight && (
        <Container size="wide" className="py-16 sm:py-24">
          <SectionHeader
            eyebrow="À la une"
            title="La sélection du moment"
            description="Les ouvrages mis en avant par nos éditeurs et auteurs, disponibles dès maintenant."
            href="/livres"
            linkLabel="Tout le catalogue"
          />

          <Reveal
            stagger={0.09}
            className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center"
          >
            <SpotlightWork work={spotlight} />

            {rest.length > 0 && (
              <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:gap-x-7">
                {rest.map((work) => (
                  <BookCard key={work.id} work={work} variant="compact" />
                ))}
              </div>
            )}
          </Reveal>
        </Container>
      )}

      {activeCategories.length > 0 && (
        <section className="bg-paper-100 border-border border-y">
          <Container size="wide" className="py-16 sm:py-20">
            <SectionHeader
              eyebrow="Par domaine"
              title="Entrer par ce qui vous intéresse"
              description="Le catalogue est organisé par domaine plutôt que par nouveauté : on y cherche un sujet, pas une date de parution."
            />

            {/*
             * Grille auto-ajustée plutôt qu'un nombre de colonnes fixe : avec
             * quatre domaines sur trois colonnes, la maquette précédente
             * laissait une cellule vide qui se lisait comme un bug.
             */}
            <Reveal
              as="ul"
              stagger={0.04}
              className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]"
            >
              {activeCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/livres?category=${category.slug}`}
                    className="border-border bg-card hover:border-primary/40 hover:bg-paper-50 group flex h-full min-h-24 items-center justify-between gap-4 rounded-lg border px-5 py-5 transition-colors duration-[--duration-fast]"
                  >
                    <span className="min-w-0">
                      <span className="type-h3 text-secondary group-hover:text-primary block transition-colors duration-[--duration-fast]">
                        {category.name}
                      </span>
                      <span className="type-meta">
                        {category.workCount}{" "}
                        {category.workCount > 1 ? "ouvrages" : "ouvrage"}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="text-ink-300 group-hover:text-primary size-4 shrink-0 transition-[color,transform] duration-[--duration-base] group-hover:translate-x-1"
                    />
                  </Link>
                </li>
              ))}
            </Reveal>
          </Container>
        </section>
      )}

      <Container size="wide" className="py-16 sm:py-24">
        <SectionHeader
          eyebrow="Formats"
          title="Le même livre, la lecture qui vous convient"
          description="Une œuvre peut exister en plusieurs formats, chacun avec son prix et son mode de remise. Vous choisissez au moment de l’achat."
        />
        <Reveal
          as="ul"
          stagger={0.06}
          className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FORMATS.map((format) => (
            <FormatNote key={format.title} {...format} />
          ))}
        </Reveal>
      </Container>

      {featured.data.length > 5 && (
        <Container size="wide" className="pb-16 sm:pb-24">
          <SectionHeader
            eyebrow="Encore"
            title="À découvrir aussi"
            href="/livres"
            linkLabel="Voir tout"
          />
          <BookGrid works={featured.data.slice(5)} />
        </Container>
      )}

      {authors.length > 0 && (
        <section className="bg-paper-100 border-border border-y">
          <Container size="wide" className="py-16 sm:py-20">
            <SectionHeader
              eyebrow="Les auteurs"
              title="Derrière chaque livre, une voix"
              href="/auteurs"
              linkLabel="Tous les auteurs"
            />
            <Reveal
              stagger={0.06}
              className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3"
            >
              {authors.slice(0, 3).map((author) => (
                <AuthorCard key={author.id} author={author} />
              ))}
            </Reveal>
          </Container>
        </section>
      )}

      <Container size="wide" className="pb-16 sm:pb-24">
        <div className="border-border bg-card relative overflow-hidden rounded-xl border p-8 sm:p-10">
          <div aria-hidden className="bg-accent absolute inset-y-0 left-0 w-0.5" />
          <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
            <Feather aria-hidden className="text-primary size-9 shrink-0" />
            <div>
              <p className="type-label rule-accent text-muted-foreground">Vous publiez ?</p>
              <h2 className="type-h2 text-secondary mt-1">
                Ouvrez votre espace auteur ou maison d’édition
              </h2>
              <p className="text-muted-foreground mt-2 max-w-2xl text-[0.9375rem] text-pretty">
                Auteur indépendant, collectif ou maison d’édition : créez votre espace
                GeBook pour publier vos ouvrages, choisir leurs formats et suivre vos
                ventes.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/creer-un-espace">Créer mon espace</Link>
            </Button>
          </div>
        </div>
      </Container>

      <Container size="wide" className="py-16 sm:py-24">
        <SectionHeader
          eyebrow="Comment ça marche"
          title="De la découverte à la lecture, en trois temps"
        />
        <Reveal as="ol" stagger={0.08} className="grid gap-10 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <span
                aria-hidden
                className="font-heading text-paper-300 block text-5xl leading-none font-semibold"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="type-h3 text-secondary mt-3">{step.title}</h3>
              <p className="text-muted-foreground mt-2 text-[0.9375rem] leading-relaxed text-pretty">
                {step.description}
              </p>
            </li>
          ))}
        </Reveal>
      </Container>

      <Container size="wide" className="pb-24">
        <div className="bg-ink-900 paper-grain relative overflow-hidden rounded-xl px-6 py-16 text-center sm:px-14 sm:py-20">
          <div aria-hidden className="bg-accent absolute inset-x-0 top-0 h-0.5" />
          <p className="type-label rule-accent [&::before]:mx-auto text-white/60">
            Créer un compte
          </p>
          <h2 className="type-h1 mx-auto max-w-2xl text-white">
            Vos achats, vos formats et vos commandes, réunis au même endroit.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-white/70 text-pretty">
            Le compte GeBook est gratuit. Il garde la trace de vos commandes et vous
            donnera accès à votre bibliothèque numérique dès son ouverture.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/inscription">Créer mon compte</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:border-white/40 hover:bg-white/10 hover:text-white"
            >
              <Link href="/livres">Parcourir d’abord</Link>
            </Button>
          </div>
        </div>
      </Container>
    </>
  );
}

/**
 * Hero.
 *
 * Deux colonnes sur grand écran : le discours à gauche, l'objet à droite. Le
 * texte n'est jamais posé sur le canvas — si la scène 3D ne se monte pas (petit
 * écran, mouvement réduit, WebGL absent), la colonne disparaît simplement et la
 * mise en page reste équilibrée. Rien d'essentiel ne dépend du rendu 3D.
 */
function Hero({
  workCount,
  authorCount,
  categoryCount,
}: {
  workCount: number;
  authorCount: number;
  categoryCount: number;
}) {
  return (
    <section className="border-border paper-grain relative overflow-hidden border-b">
      {/* Halo très doux, en fond : il donne de la profondeur sans dégradé visible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-30%] right-[-10%] size-[46rem] rounded-full bg-[radial-gradient(circle,var(--accent-muted)_0%,transparent_62%)] opacity-70"
      />

      <Container
        size="wide"
        className="relative grid items-center gap-12 pt-16 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:pt-24 lg:pb-28"
      >
        <Reveal stagger={0.1} className="max-w-2xl">
          <p className="type-label rule-accent text-muted-foreground">
            La plateforme des éditeurs africains
          </p>

          <h1 className="type-display text-secondary">
            Les livres qui racontent
            <span className="text-primary"> l’Afrique centrale</span>, dans le format qui
            vous va.
          </h1>

          <p className="type-subtitle mt-6 max-w-xl">
            GeBook réunit les éditeurs, collectifs et auteurs indépendants d’Afrique sur
            une seule librairie numérique. Romans, essais et manuels congolais et
            africains — en PDF, en EPUB, en audio ou en papier.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/livres">
                <Search aria-hidden />
                Explorer le catalogue
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/auteurs">Rencontrer les auteurs</Link>
            </Button>
          </div>

          {/*
           * Trois chiffres, tous issus de la base. Volontairement discrets : à
           * cette échelle de catalogue, les afficher en gros les rendrait
           * modestes plutôt qu'impressionnants.
           */}
          <dl className="border-border mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t pt-6">
            <Stat value={workCount} label="ouvrages publiés" />
            <Stat value={authorCount} label="auteurs" />
            <Stat value={categoryCount} label="domaines" />
          </dl>
        </Reveal>

        <div className="relative hidden h-[30rem] lg:block">
          <HeroVisual />
        </div>
      </Container>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="font-heading text-secondary tnum text-2xl font-semibold">
          {formatNumber(value)}
        </span>
        <span className="type-caption">{label}</span>
      </dd>
    </div>
  );
}

/** Mise en avant éditoriale du premier ouvrage en vedette. */
function SpotlightWork({
  work,
}: {
  work: Awaited<ReturnType<typeof fetchWorks>>["data"][number];
}) {
  return (
    <article className="group border-border bg-card relative flex flex-col gap-7 rounded-xl border p-6 sm:flex-row sm:items-center sm:p-8">
      {/* Plus large que les vignettes voisines : la mise en avant doit peser
          plus lourd à l'œil que les ouvrages qui l'accompagnent. */}
      <div className="w-44 shrink-0 sm:w-52">
        <BookCover
          title={work.title}
          authorName={work.author.penName}
          coverPath={work.coverPath}
          priority
          sizes="176px"
          className="transition-transform duration-[--duration-base] ease-[--ease-out] group-hover:-translate-y-1"
        />
      </div>

      <div className="min-w-0">
        {work.category && (
          <p className="type-label text-muted-foreground">{work.category.name}</p>
        )}
        <h3 className="type-h2 text-secondary mt-1.5">
          <Link
            href={`/livres/${work.slug}`}
            className="after:absolute after:inset-0 after:content-[''] hover:text-primary transition-colors duration-[--duration-fast]"
          >
            {work.title}
          </Link>
        </h3>
        <p className="text-muted-foreground mt-1">{work.author.penName}</p>

        {work.shortDescription && (
          <p className="text-foreground/80 mt-4 line-clamp-4 leading-relaxed text-pretty">
            {work.shortDescription}
          </p>
        )}

        {/* Repère visuel seulement : le lien du titre couvre déjà toute la
            fiche, en ajouter un second doublerait l'arrêt au clavier. */}
        <p className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-semibold">
          Découvrir cet ouvrage
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-[--duration-base] group-hover:translate-x-1"
          />
        </p>
      </div>
    </article>
  );
}

const FORMATS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: BookOpen,
    title: "PDF",
    description:
      "La mise en page d’origine, fidèle au livre imprimé. À lire sur ordinateur ou à imprimer.",
  },
  {
    icon: Library,
    title: "EPUB",
    description:
      "Le texte s’adapte à votre écran et à la taille de police que vous choisissez.",
  },
  {
    icon: Headphones,
    title: "Audio",
    description:
      "L’ouvrage lu à voix haute, pour les trajets et les moments où l’on ne peut pas lire.",
  },
  {
    icon: Truck,
    title: "Papier",
    description:
      "Le livre imprimé, livré à l’adresse que vous indiquez au moment de la commande.",
  },
];

function FormatNote({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <li className="border-border border-t pt-5">
      <Icon aria-hidden className="text-primary size-5" />
      <h3 className="type-h3 text-secondary mt-3">{title}</h3>
      <p className="text-muted-foreground mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">
        {description}
      </p>
    </li>
  );
}

const STEPS: { title: string; description: string }[] = [
  {
    title: "Trouvez l’ouvrage",
    description:
      "Cherchez par titre, par auteur ou par domaine. Chaque fiche indique les formats réellement disponibles et leur prix.",
  },
  {
    title: "Choisissez votre format",
    description:
      "Numérique, audio ou papier : le prix et le mode de remise sont affichés avant la commande, sans surprise à la fin.",
  },
  {
    title: "Commandez et suivez",
    description:
      "La commande est enregistrée avec son numéro. Vous en suivez le statut à tout moment depuis « Mes commandes ».",
  },
];
