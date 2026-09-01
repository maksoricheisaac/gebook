import Link from "next/link";
import { BookOpen, Check, Library, Percent, Receipt, Rocket, Users } from "lucide-react";

import { LogoLink } from "@/src/components/layout/logo";

/*
 * Gabarit des pages d'authentification.
 *
 * Deux panneaux : le formulaire sur papier à gauche, un panneau d'encre à droite
 * qui rappelle à quoi sert le compte. La version précédente posait un rectangle
 * blanc de 28 rem au milieu d'une page vide — le formulaire flottait sans
 * contexte, et rien ne donnait envie de le remplir.
 *
 * Le panneau de droite disparaît sous 1024 px : sur un téléphone, l'écran doit
 * être entièrement consacré à la saisie.
 */
export function AuthLayout({
  title,
  description,
  footer,
  aside = "reader",
  children,
}: {
  title: string;
  description: string;
  /** Lien de bascule vers l'autre page d'authentification. */
  footer: React.ReactNode;
  aside?: "reader" | "welcome" | "publisher";
  children: React.ReactNode;
}) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <h1 className="type-h1 text-secondary">{title}</h1>
          <p className="type-subtitle mt-3">{description}</p>

          <div className="mt-9">{children}</div>

          <div className="border-border mt-8 border-t pt-6">{footer}</div>
        </div>
      </div>

      <aside className="bg-ink-900 paper-grain relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div aria-hidden className="bg-accent absolute inset-x-0 top-0 h-0.5" />

        <LogoLink variant="plaque" />

        <div>
          <p className="type-label text-white/60">
            {aside === "publisher" ? "Votre espace GeBook" : "Votre compte GeBook"}
          </p>
          <h2 className="type-h2 mt-3 max-w-sm text-white">
            {aside === "publisher"
              ? "Publiez, vendez, rayonnez — à votre nom."
              : aside === "welcome"
                ? "Un compte gratuit, et le catalogue devient le vôtre."
                : "Retrouvez vos commandes et vos formats."}
          </h2>

          <ul className="mt-8 space-y-4">
            {aside === "publisher" ? (
              <>
                <Benefit icon={Rocket}>
                  Publiez vos œuvres et gérez leurs formats, prix et couvertures.
                </Benefit>
                <Benefit icon={Percent}>
                  Vos ventes et vos commissions, calculées et suivies pour vous.
                </Benefit>
                <Benefit icon={Users}>
                  Invitez une équipe et partagez la gestion de votre espace.
                </Benefit>
              </>
            ) : (
              <>
                <Benefit icon={Receipt}>
                  Le suivi de chaque commande, avec son numéro et son statut.
                </Benefit>
                <Benefit icon={BookOpen}>
                  Le choix du format au moment de l’achat : numérique ou papier.
                </Benefit>
                <Benefit icon={Library}>
                  Votre bibliothèque numérique, dès l’ouverture des téléchargements.
                </Benefit>
              </>
            )}
          </ul>
        </div>

        <p className="text-xs text-white/60">
          En créant un compte, vous acceptez les{" "}
          <Link
            href="/a-propos"
            className="underline underline-offset-4 hover:text-white/70"
          >
            conditions d’utilisation
          </Link>{" "}
          de GeBook.
        </p>
      </aside>
    </div>
  );
}

function Benefit({
  icon: Icon,
  children,
}: {
  icon: typeof Check;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 text-sm leading-relaxed text-white/75">
      <Icon aria-hidden className="text-accent mt-0.5 size-4 shrink-0" />
      {children}
    </li>
  );
}
