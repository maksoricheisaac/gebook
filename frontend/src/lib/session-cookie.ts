/**
 * Doit rester identique au nom calculé par `new_stack/backend/src/modules/auth/session-cookie.ts` :
 * c'est le frontend qui lit ce cookie côté serveur pour savoir qui est connecté, et
 * `proxy.ts` qui vérifie sa seule présence avant même d'appeler l'API.
 */
const isProduction = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_NAME = isProduction
  ? "__Host-gebook_session"
  : "gebook_session";
