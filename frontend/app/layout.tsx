import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

/*
 * Le couple typographique de GeBook, auto-hébergé par `next/font` : aucun appel
 * à Google depuis le navigateur du visiteur, et aucune bascule de police au
 * chargement.
 *
 * Fraunces remplace DM Serif Display. Le motif n'est pas esthétique mais
 * fonctionnel : DM Serif Display n'existe qu'en 400, sans italique ni taille
 * optique. Impossible d'y construire une hiérarchie — d'où les titres qui se
 * ressemblaient tous. Fraunces est variable (graisse + `opsz` + `SOFT`/`WONK`),
 * ce qui permet à un titre de 64 px et à un titre de 18 px d'avoir le dessin
 * qui convient à leur taille.
 *
 * Instrument Sans remplace Manrope : grotesque neutre et légèrement resserré,
 * il laisse le serif porter la voix éditoriale au lieu de lui faire concurrence.
 */
/*
 * `weight` est volontairement absent des deux : c'est ce qui demande à
 * `next/font` de servir la fonte VARIABLE plutôt qu'une série de fichiers
 * statiques. Un seul fichier par famille, toutes les graisses disponibles, et
 * les axes de Fraunces (`opsz`, `SOFT`, `WONK`) réellement pilotables depuis le
 * CSS — ce que `font-variation-settings` exploite dans `globals.css`.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gebook.com"),
  title: {
    default: "GeBook — La plateforme numérique des éditeurs et auteurs africains",
    template: "%s · GeBook",
  },
  description:
    "Découvrez, lisez et achetez des œuvres africaines en numérique, en audio et en papier. GeBook réunit éditeurs, collectifs et auteurs indépendants sur une seule plateforme d'édition et de vente.",
  applicationName: "GeBook",
  keywords: [
    "livres africains",
    "édition congolaise",
    "librairie numérique",
    "auto-édition",
    "livre audio",
  ],
  openGraph: {
    type: "website",
    siteName: "GeBook",
    locale: "fr_FR",
    title: "GeBook — La plateforme numérique des éditeurs et auteurs africains",
    description:
      "Découvrez, lisez et achetez des œuvres africaines en numérique, en audio et en papier.",
  },
  twitter: {
    card: "summary_large_image",
    title: "GeBook — La plateforme numérique des éditeurs et auteurs africains",
    description:
      "Découvrez, lisez et achetez des œuvres africaines en numérique, en audio et en papier.",
  },
};

/*
 * `themeColor` habille la barre d'adresse mobile avec l'ivoire du site plutôt
 * qu'avec le blanc par défaut du navigateur. `maximumScale` n'est volontairement
 * pas restreint : bloquer le zoom est une faute d'accessibilité.
 */
export const viewport: Viewport = {
  themeColor: "#fdfcf9",
  colorScheme: "light",
};

/*
 * Armement du mouvement, avant le premier rendu.
 *
 * Ce script pose `data-motion="on"` sur `<html>` uniquement si le visiteur n'a
 * pas demandé un mouvement réduit. C'est cet attribut, et lui seul, qui autorise
 * `globals.css` à masquer les blocs en attente de révélation.
 *
 * Il est synchrone et inline pour une raison : posé plus tard, l'attribut
 * arriverait après la première peinture et le contenu clignoterait. Absent — JS
 * coupé, bundle en échec, mouvement réduit — rien n'est masqué et la page reste
 * entièrement lisible.
 */
const MOTION_BOOTSTRAP = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.motion="on"}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${instrumentSans.variable} ${fraunces.variable} h-full`}
      /* `data-motion` est posé par le script ci-dessus AVANT l'hydratation :
         React voit donc un attribut qu'il n'a pas rendu. La suppression ne porte
         que sur les attributs de cette balise, jamais sur le contenu de la page. */
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#contenu" className="skip-link">
          Aller au contenu principal
        </a>
        {children}
      </body>
    </html>
  );
}
