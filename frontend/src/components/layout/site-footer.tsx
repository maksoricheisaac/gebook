import Link from "next/link";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import { LogoLink } from "./logo";
import { MAIN_NAVIGATION } from "./navigation";

/*
 * Pied de page.
 *
 * Quatre colonnes réelles : la maison, le catalogue, le compte, le contact.
 * Le téléphone et l'adresse — qui occupaient une barre sombre au-dessus de
 * l'en-tête — les rejoignent ici, à l'endroit où on les cherche.
 *
 * Aucun lien mort. Les colonnes « Aide & Support » de la version PHP pointaient
 * toutes vers `#` : mieux vaut un pied de page court et honnête qu'une façade.
 * Les moyens de paiement sont annoncés comme « prévus » tant qu'aucun
 * prestataire réel n'est raccordé — le dire est plus solide que le suggérer.
 *
 * Aucune marge haute non plus, volontairement : c'est à chaque page de fixer son
 * espace de fin. Le `mt-28` qui vivait ici laissait une bande vide sous les
 * écrans pleine hauteur — les pages d'authentification, dont le panneau sombre
 * s'interrompait net avant le pied de page.
 */
export function SiteFooter() {
  return (
    <footer className="bg-ink-900 relative overflow-hidden text-white/80">
      {/* Filet doré : la signature éditoriale, reprise du sur-titre des sections. */}
      <div aria-hidden className="bg-accent h-0.5 w-full" />

      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-5">
          <LogoLink variant="plaque" />
          <p className="max-w-xs text-sm leading-relaxed text-pretty">
            La plateforme numérique des éditeurs et auteurs d’Afrique centrale. Publier,
            vendre et faire circuler leurs voix, dans tous les formats de lecture.
          </p>
        </div>

        <FooterColumn title="Explorer">
          {MAIN_NAVIGATION.map((item) => (
            <FooterLink key={item.href} href={item.href}>
              {item.label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Mon compte">
          <FooterLink href="/connexion">Connexion</FooterLink>
          <FooterLink href="/inscription">Créer un compte</FooterLink>
          <FooterLink href="/mes-commandes">Mes commandes</FooterLink>
          <FooterLink href="/creer-un-espace">Devenir auteur / éditeur</FooterLink>
        </FooterColumn>

        <FooterColumn title="Nous joindre">
          <a
            className="flex items-center gap-2.5 text-sm transition-colors hover:text-white"
            href="tel:+242061234567"
          >
            <Phone aria-hidden className="text-accent size-4 shrink-0" />
            +242 06 123 45 67
          </a>
          <a
            className="flex items-center gap-2.5 text-sm transition-colors hover:text-white"
            href="mailto:contact@gebook.com"
          >
            <Mail aria-hidden className="text-accent size-4 shrink-0" />
            contact@gebook.com
          </a>
          <p className="flex items-center gap-2.5 text-sm">
            <MapPin aria-hidden className="text-accent size-4 shrink-0" />
            Brazzaville, Congo
          </p>

          <div className="pt-3">
            <p className="type-label mb-2 text-white/60">Paiements prévus</p>
            <div className="flex flex-wrap gap-1.5">
              {["MTN MoMo", "Airtel Money", "Visa", "Mastercard"].map((method) => (
                <span
                  key={method}
                  className="rounded-sm border border-white/15 px-2 py-1 text-[0.6875rem] font-medium text-white/70"
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </FooterColumn>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 GeBook. Tous droits réservés.</p>
          <p className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-3.5" />
            Vos données restent chez GeBook · Conçu par B-LAB
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="type-label font-sans text-white">{title}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="w-fit text-sm transition-colors hover:text-white">
      {children}
    </Link>
  );
}
