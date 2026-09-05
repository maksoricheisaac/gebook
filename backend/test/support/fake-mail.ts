import type { MailMessage } from '../../src/modules/mail/mail.service';

/**
 * Remplace `MailService` dans les tests e2e : ceux-ci exercent la logique de
 * vérification d'adresse (jeton, expiration, connexion au clic), pas la
 * disponibilité d'un vrai compte Resend — même principe que
 * `fakeVirusScanner` pour `clamd`. Les e-mails « envoyés » sont conservés en
 * mémoire, ce qui permet à un test d'en extraire le jeton de vérification
 * exactement comme un utilisateur cliquerait le lien reçu.
 */
export function fakeMailService(): {
  isConfigured: () => boolean;
  send: (message: MailMessage) => Promise<void>;
  sent: MailMessage[];
} {
  const sent: MailMessage[] = [];
  return {
    isConfigured: () => true,
    send: (message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    },
    sent,
  };
}

/** Extrait le jeton du lien `/verifier-email?token=...` d'un e-mail capturé. */
export function extractVerificationToken(html: string): string {
  const match = /verifier-email\?token=([^"&\s]+)/.exec(html);
  if (!match) {
    throw new Error("Aucun jeton de vérification trouvé dans l'e-mail.");
  }
  return decodeURIComponent(match[1]);
}
