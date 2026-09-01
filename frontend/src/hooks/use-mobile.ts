import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Réécrite avec `useSyncExternalStore` plutôt que `useEffect` + `setState`
 * (version d'origine du bloc shadcn/ui) : cette dernière écrit l'état
 * *après* le premier rendu, ce que la règle `react-hooks/set-state-in-effect`
 * de ce dépôt refuse — même raisonnement que `useSyncExternalStore` déjà
 * utilisé ailleurs dans l'admin pour lire un état externe sans décalage
 * d'hydratation.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
