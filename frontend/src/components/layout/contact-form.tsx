"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";

const SUBJECTS = [
  "Question générale",
  "Aide avec une commande",
  "Proposition éditoriale",
  "Autre demande",
];

/**
 * Formulaire de contact.
 *
 * Aucun service de notification n'existe encore côté backend. Le formulaire ne
 * fait donc rien partir, et il le dit — plutôt que d'afficher un « message
 * envoyé » qui serait un mensonge.
 *
 * L'écran de confirmation propose l'adresse et le téléphone : c'est le vrai
 * chemin, et il doit être à un clic quand le formulaire ne peut pas aboutir.
 */
export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="border-border bg-card rounded-xl border p-8 text-center">
        <Mail aria-hidden className="text-primary mx-auto size-8" />
        <h2 className="type-h3 text-secondary mt-4">
          L’envoi automatique n’est pas encore actif
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed text-pretty">
          Votre message n’a pas été transmis. Le service d’envoi arrivera avec les
          notifications — en attendant, écrivez-nous directement, nous répondons sous deux
          jours ouvrés.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <a href="mailto:contact@gebook.com">Écrire à contact@gebook.com</a>
          </Button>
          <Button variant="outline" onClick={() => setSubmitted(false)}>
            Revenir au formulaire
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="border-border bg-card grid gap-5 rounded-xl border p-6 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact_name" label="Nom complet" required>
          <Input name="name" autoComplete="name" />
        </Field>

        <Field id="contact_email" label="Adresse e-mail" required>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
      </div>

      <Field id="subject" label="Sujet">
        <Select name="subject">
          {SUBJECTS.map((subject) => (
            <option key={subject}>{subject}</option>
          ))}
        </Select>
      </Field>

      <Field
        id="message"
        label="Votre message"
        hint="Indiquez votre numéro de commande si votre demande la concerne."
        required
      >
        <Textarea name="message" rows={6} />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg">
          <Send aria-hidden />
          Envoyer le message
        </Button>
        <p className="type-caption max-w-xs">
          Formulaire de démonstration : l’envoi sera activé avec le service de
          notification.
        </p>
      </div>
    </form>
  );
}
