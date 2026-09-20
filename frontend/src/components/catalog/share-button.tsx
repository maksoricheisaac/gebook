"use client";

import { useState } from "react";
import { Check, Link as LinkIcon, Share2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";

/**
 * Bouton de partage d'une page publique (auteur, espace…) — brief §3 :
 * l'objectif est qu'un auteur puisse copier son lien GeBook et le diffuser à
 * son audience, WhatsApp en tête sur mobile.
 *
 * `navigator.share` couvre nativement WhatsApp et les autres applications
 * installées sur mobile — c'est la voie prioritaire. Un navigateur de bureau
 * qui ne l'expose pas retombe sur la copie du lien, jamais une impasse.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Partage annulé par la personne : rien à faire, pas une erreur.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission
      // refusée) : le lien reste visible et sélectionnable par la personne.
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare}>
      {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
      {copied ? "Lien copié" : "Partager"}
    </Button>
  );
}

/** Lien direct « Partager sur WhatsApp », affiché à côté du bouton générique
 * ci-dessus — WhatsApp étant explicitement le canal prioritaire visé (brief §3). */
export function WhatsAppShareLink({ title, path }: { title: string; path: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const text = encodeURIComponent(`${title} — ${origin}${path}`);
  return (
    <Button asChild type="button" variant="ghost" size="sm">
      <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer">
        <LinkIcon aria-hidden />
        WhatsApp
      </a>
    </Button>
  );
}
