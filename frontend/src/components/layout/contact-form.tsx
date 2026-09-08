"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input, Select, Textarea } from "@/src/components/ui/input";
import { submitContactAction, type ContactFormState } from "@/src/lib/contact-actions";

const SUBJECTS = [
  "Question générale",
  "Aide avec une commande",
  "Proposition éditoriale",
  "Autre demande",
];

const initialState: ContactFormState = {};

/**
 * Formulaire de contact.
 *
 * Passe par `submitContactAction` (Server Action) plutôt que par un `fetch`
 * client direct — même raisonnement que les formulaires d'authentification :
 * `OriginGuard` (backend) exige un en-tête `Origin` sur toute écriture, et un
 * appel serveur à serveur le garantit toujours.
 *
 * La confirmation est double, comme demandé : un toast immédiat côté client
 * (`sonner`, déjà monté dans `(site)/layout.tsx`), et un accusé de réception
 * envoyé par e-mail par l'API (`ContactService`, backend).
 */
export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.submittedAt) {
      toast.success("Message envoyé. Un e-mail de confirmation vous a été envoyé.");
      formRef.current?.reset();
    }
  }, [state.submittedAt]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-border bg-card grid gap-5 rounded-xl border p-6 sm:p-8"
    >
      <FormError message={state.error} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="contact_name"
          label="Nom complet"
          required
          error={state.fieldErrors?.name?.[0]}
        >
          <Input name="name" autoComplete="name" />
        </Field>

        <Field
          id="contact_email"
          label="Adresse e-mail"
          required
          error={state.fieldErrors?.email?.[0]}
        >
          <Input name="email" type="email" autoComplete="email" />
        </Field>
      </div>

      <Field id="subject" label="Sujet" error={state.fieldErrors?.subject?.[0]}>
        <Select name="subject" defaultValue={SUBJECTS[0]}>
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
        error={state.fieldErrors?.message?.[0]}
      >
        <Textarea name="message" rows={6} />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" isLoading={pending}>
          {!pending && <Send aria-hidden />}
          {pending ? "Envoi en cours…" : "Envoyer le message"}
        </Button>
        <p className="type-caption max-w-xs">
          Nous répondons habituellement sous deux jours ouvrés.
        </p>
      </div>
    </form>
  );
}
