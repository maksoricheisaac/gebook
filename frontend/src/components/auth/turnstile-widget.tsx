"use client";

import { useEffect, useId, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
// Clé site publique de test Cloudflare (toujours acceptée, jamais liée à un
// compte réel) : même repli que côté backend, le développement fonctionne
// sans compte Cloudflare — voir `TURNSTILE_SECRET_KEY` dans `environment.ts`.
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000000000000000AA";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Impossible de charger la vérification anti-robot."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Widget Cloudflare Turnstile pour l'inscription et la connexion. Écrit le
 * jeton résolu dans un champ caché `turnstileToken`, lu par la Server Action
 * au même titre que les autres champs du formulaire (`FormData`) — voir
 * `TurnstileGuard` côté backend, seule autorité réelle sur sa validité.
 *
 * Chargée dynamiquement (pas de dépendance npm) : même principe que les
 * autres scripts tiers du site.
 */
export function TurnstileWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const inputId = useId();

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (resolvedToken) => setToken(resolvedToken),
          "expired-callback": () => setToken(""),
          "error-callback": () => setFailed(true),
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, []);

  return (
    <div>
      <div ref={containerRef} />
      <input type="hidden" name="turnstileToken" value={token} readOnly id={inputId} />
      {failed && (
        <p className="text-destructive mt-1.5 text-xs">
          La vérification anti-robot n’a pas pu se charger. Rechargez la page.
        </p>
      )}
    </div>
  );
}
