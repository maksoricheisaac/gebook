"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/*
 * Révélation au défilement.
 *
 * C'est le SEUL mécanisme d'animation au scroll du produit. Un composant plutôt
 * qu'un effet recopié de page en page, pour que le rythme reste identique
 * partout : même distance, même durée, même courbe, même décalage.
 *
 * Il anime ses **enfants directs**, un par un. L'état de départ est déclaré en
 * CSS sur `[data-motion="on"] [data-reveal-root] > *` : rien à cloner, rien à
 * marquer à la main, et le rendu serveur est déjà dans le bon état — donc aucun
 * clignotement à l'hydratation.
 *
 * Ce qu'il ne fait pas, volontairement :
 *   - il ne rejoue pas l'animation au retour vers le haut (`once: true`) : une
 *     page longue qui re-anime en permanence est fatigante ;
 *   - il n'anime que `opacity` et `transform`, les deux seules propriétés que le
 *     compositeur traite sans recalcul de mise en page ;
 *   - il ne s'exécute pas sous `prefers-reduced-motion` — et dans ce cas l'état
 *     initial CSS ne s'applique pas non plus, donc le contenu est simplement là.
 */
export function Reveal({
  children,
  /** Décalage entre enfants successifs, en secondes. `0` les anime d'un bloc. */
  stagger = 0.08,
  /** Retarde le départ, pour enchaîner deux blocs voisins. */
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  stagger?: number;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "ul" | "ol" | "article";
}) {
  const container = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = container.current;
      if (!root) return;

      const targets = Array.from(root.children) as HTMLElement[];
      if (targets.length === 0) return;

      // `matchMedia` est ce qui rend la préférence système réellement
      // respectée : à son basculement, GSAP révoque de lui-même ses styles.
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.55,
          delay,
          ease: "power2.out",
          stagger,
          scrollTrigger: {
            trigger: root,
            // 88 % : le bloc s'anime juste avant d'entrer dans le champ de
            // vision, jamais après — sinon on voit le contenu apparaître en
            // retard sur son propre défilement.
            start: "top 88%",
            once: true,
          },
          // Filet de sécurité : une fois l'animation jouée, l'attribut neutralise
          // l'état initial CSS même si GSAP est révoqué par la suite.
          onComplete: () => {
            for (const target of targets) {
              target.setAttribute("data-revealed", "true");
            }
          },
        });
      });

      return () => mm.revert();
    },
    { scope: container, dependencies: [stagger, delay] },
  );

  return (
    <Tag ref={container as never} className={className} data-reveal-root="">
      {children}
    </Tag>
  );
}
