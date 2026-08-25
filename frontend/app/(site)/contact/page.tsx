import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";

import { ContactForm } from "@/src/components/layout/contact-form";
import { Container, PageHeader } from "@/src/components/layout/page-shell";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contacter GeBook : e-mail, téléphone et formulaire de demande.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <Container size="wide" className="pb-20">
      <PageHeader
        eyebrow="Nous joindre"
        title="Une question ? Parlons-en."
        description="Achats, lectures, projets éditoriaux : nous répondons généralement sous deux jours ouvrés."
      />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <aside className="space-y-8">
          <ul className="divide-border divide-y">
            <ContactItem
              icon={Mail}
              label="E-mail"
              value="contact@gebook.com"
              href="mailto:contact@gebook.com"
            />
            <ContactItem
              icon={Phone}
              label="Téléphone"
              value="+242 06 123 45 67"
              href="tel:+242061234567"
            />
            <ContactItem icon={MapPin} label="Adresse" value="Brazzaville, Congo" />
            <ContactItem
              icon={Clock}
              label="Disponibilité"
              value="Du lundi au vendredi, 8 h – 17 h"
            />
          </ul>

          <div className="bg-paper-100 border-border rounded-lg border p-5">
            <h2 className="type-h3 text-secondary">Vous êtes auteur ?</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
              Notre équipe étudie les manuscrits d’auteurs congolais et africains, avant
              de les orienter vers l’éditeur ou le collectif qui leur correspond le mieux.
              Choisissez « Proposition éditoriale » dans le formulaire et décrivez votre
              projet en quelques lignes.
            </p>
          </div>
        </aside>

        <ContactForm />
      </div>
    </Container>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <Icon aria-hidden className="text-primary mt-0.5 size-4 shrink-0" />
      <span>
        <span className="type-caption block">{label}</span>
        <span className="text-secondary text-[0.9375rem] font-medium">{value}</span>
      </span>
    </>
  );

  return (
    <li className="py-4">
      {href ? (
        <a
          href={href}
          className="hover:text-primary flex items-start gap-3 transition-colors duration-[--duration-fast]"
        >
          {content}
        </a>
      ) : (
        <span className="flex items-start gap-3">{content}</span>
      )}
    </li>
  );
}
