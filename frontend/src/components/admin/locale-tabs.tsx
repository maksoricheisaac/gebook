"use client";

import { useId, useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/utils";

/**
 * Activation de l'anglais dans l'admin. La base de données, l'API et le repli
 * FR->EN restent entièrement fonctionnels quoi qu'il arrive ici — cette
 * constante ne fait que masquer l'onglet à l'écran, pour ne pas alourdir la
 * saisie tant que ce n'est pas la priorité du MVP (mise sur le marché rapide,
 * retours d'abord). La remettre à `true` suffit à rouvrir la fonctionnalité,
 * sans aucune migration ni changement ailleurs : les formulaires continuent
 * de calculer `isEnTranslated` et de passer `en`, simplement ignorés tant que
 * ce drapeau est faux.
 */
export const ENGLISH_TRANSLATIONS_ENABLED = false;

/**
 * Bascule FR/EN pour les champs traduisibles d'un formulaire admin (Phase 1
 * « bilinguisme »).
 *
 * Les deux panneaux restent montés en permanence (`hidden`, jamais démonté) :
 * les champs qu'ils contiennent sont enregistrés par react-hook-form, et un
 * champ démonté puis remonté y perdrait son état de validation le temps d'un
 * cycle de rendu. Volontairement muet sur la validité de l'anglais — c'est au
 * formulaire parent de calculer `isEnTranslated` (le badge ne fait que
 * refléter ce qu'on lui donne, il ne décide de rien lui-même).
 */
export function LocaleTabs({
  isEnTranslated,
  fr,
  en,
}: {
  /** Faux tant qu'aucun champ anglais n'a de contenu — affiche le badge « non traduit ». */
  isEnTranslated: boolean;
  fr: React.ReactNode;
  en: React.ReactNode;
}) {
  const [active, setActive] = useState<"fr" | "en">("fr");
  const groupId = useId();

  if (!ENGLISH_TRANSLATIONS_ENABLED) {
    // L'anglais reste enregistré dans le formulaire (voir plus haut) — seul
    // l'onglet disparaît, pour un écran de saisie français simple pendant le
    // MVP.
    return <div className="space-y-5">{fr}</div>;
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Langue du contenu"
        className="border-border mb-4 flex gap-1 border-b"
      >
        <TabButton
          id={`${groupId}-fr-tab`}
          panelId={`${groupId}-fr-panel`}
          active={active === "fr"}
          onClick={() => setActive("fr")}
        >
          Français
        </TabButton>
        <TabButton
          id={`${groupId}-en-tab`}
          panelId={`${groupId}-en-panel`}
          active={active === "en"}
          onClick={() => setActive("en")}
        >
          English
          {!isEnTranslated && (
            <Badge variant="neutral" className="py-0.5 pr-2 pl-1.5 text-[0.6875rem]">
              Non traduit
            </Badge>
          )}
        </TabButton>
      </div>

      <div
        id={`${groupId}-fr-panel`}
        role="tabpanel"
        aria-labelledby={`${groupId}-fr-tab`}
        hidden={active !== "fr"}
        className="space-y-5"
      >
        {fr}
      </div>
      <div
        id={`${groupId}-en-panel`}
        role="tabpanel"
        aria-labelledby={`${groupId}-en-tab`}
        hidden={active !== "en"}
        className="space-y-5"
      >
        {en}
      </div>
    </div>
  );
}

function TabButton({
  id,
  panelId,
  active,
  onClick,
  children,
}: {
  id: string;
  panelId: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary text-secondary"
          : "border-transparent text-muted-foreground hover:text-secondary",
      )}
    >
      {children}
    </button>
  );
}
