import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/** `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`MAIL_FROM` absents, ou rejet par
 * le serveur SMTP lui-même (identifiants invalides, boîte suspendue…) —
 * distincte d'un envoi simplement lent. */
export class MailUnavailableError extends Error {
  constructor(
    detail: string,
    override readonly cause?: unknown,
  ) {
    super(`Envoi d'e-mail indisponible : ${detail}`);
    this.name = 'MailUnavailableError';
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

const DEFAULT_SMTP_PORT = 587;
/** Port associé à TLS implicite (« SMTPS ») — les autres ports (587, 25…)
 * démarrent en clair puis négocient STARTTLS. */
const IMPLICIT_TLS_PORT = 465;

/**
 * Client SMTP de la boîte mail du domaine propre de l'installation, avec le
 * même principe fail-closed que `VirusScanService` : pas d'identifiants
 * configurés, ou rejet par le serveur SMTP, jamais traité comme un envoi
 * silencieusement ignoré — l'appelant reçoit une erreur explicite et décide
 * (typiquement un 503) plutôt qu'un compte laissé dans un état ambigu (créé
 * mais jamais notifiable).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASSWORD') &&
      this.config.get<string>('MAIL_FROM'),
    );
  }

  async send(message: MailMessage): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('MAIL_FROM');
    const port = this.config.get<number>('SMTP_PORT') ?? DEFAULT_SMTP_PORT;

    if (!host || !user || !pass || !from) {
      throw new MailUnavailableError(
        'SMTP_HOST, SMTP_USER, SMTP_PASSWORD ou MAIL_FROM non configuré(s).',
      );
    }

    this.transporter ??= createTransport({
      host,
      port,
      secure: port === IMPLICIT_TLS_PORT,
      auth: { user, pass },
    });

    try {
      await this.transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Échec d'envoi SMTP vers ${message.to} : ${detail}`);
      throw new MailUnavailableError(detail, error);
    }
  }
}
