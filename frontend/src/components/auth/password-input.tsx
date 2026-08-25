"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";

/**
 * Champ de mot de passe avec bascule d'affichage.
 *
 * Le bouton « afficher » réduit réellement les échecs de connexion : sur mobile
 * surtout, une saisie masquée qu'on ne peut pas relire se termine en erreur
 * d'identifiants sans que l'utilisateur comprenne d'où elle vient.
 *
 * C'est un vrai `<button>` placé après le champ dans l'ordre du DOM : il est donc
 * atteignable au clavier, et `aria-pressed` annonce l'état courant plutôt que de
 * laisser deviner ce que fait l'œil barré.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? "text" : "password"}
        className={cn("pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={isVisible}
        className="text-muted-foreground hover:text-secondary absolute top-1/2 right-1 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-md transition-colors duration-[--duration-fast]"
      >
        {isVisible ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}
