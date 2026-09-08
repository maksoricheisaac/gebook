import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml, renderEmailLayout } from '../mail/email-layout';
import { MailService, MailUnavailableError } from '../mail/mail.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

const DEFAULT_SUBJECT = 'Autre demande';

/**
 * Formulaire de contact public : un message envoie deux e-mails, une
 * notification à la boîte de contact (`CONTACT_RECIPIENT_EMAIL`/`MAIL_FROM`)
 * et un accusé de réception à l'expéditeur — même principe fail-closed que
 * `LoginOtpService`/`EmailVerificationService` : `MailUnavailableError`
 * remonte telle quelle plutôt que d'être avalée en silence.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async send(dto: CreateContactMessageDto): Promise<void> {
    const recipient =
      this.config.get<string>('CONTACT_RECIPIENT_EMAIL') ??
      this.config.get<string>('MAIL_FROM');

    if (!recipient) {
      throw new MailUnavailableError(
        'CONTACT_RECIPIENT_EMAIL ou MAIL_FROM non configuré(s).',
      );
    }

    const frontendUrl = this.frontendUrl();
    const logoUrl = `${frontendUrl}/logo_gebook.png`;
    const name = escapeHtml(dto.name);
    const email = escapeHtml(dto.email);
    const subject = escapeHtml(dto.subject ?? DEFAULT_SUBJECT);
    const message = escapeHtml(dto.message).replace(/\n/g, '<br />');

    const notificationHtml = renderEmailLayout({
      previewText: `Nouveau message de contact de ${dto.name}`,
      heading: 'Nouveau message de contact',
      paragraphs: [
        `<strong>De :</strong> ${name} (${email})`,
        `<strong>Sujet :</strong> ${subject}`,
        `<strong>Message :</strong><br />${message}`,
      ],
      ctaLabel: 'Répondre par e-mail',
      ctaUrl: `mailto:${dto.email}`,
      logoUrl,
    });

    const confirmationHtml = renderEmailLayout({
      previewText: 'Nous avons bien reçu votre message.',
      heading: 'Votre message a bien été reçu',
      paragraphs: [
        `Bonjour ${name},`,
        `Merci de nous avoir écrit. Voici un récapitulatif de votre message (sujet « ${subject} ») :`,
        message,
        'Notre équipe vous répondra sous deux jours ouvrés.',
      ],
      ctaLabel: 'Retourner sur GeBook',
      ctaUrl: frontendUrl,
      footnote:
        "Si vous n'êtes pas à l'origine de ce message, vous pouvez ignorer cet e-mail.",
      logoUrl,
    });

    try {
      await Promise.all([
        this.mail.send({
          to: recipient,
          subject: `[Contact] ${subject} — ${dto.name}`,
          html: notificationHtml,
        }),
        this.mail.send({
          to: dto.email,
          subject: 'Nous avons bien reçu votre message — GeBook',
          html: confirmationHtml,
        }),
      ]);
    } catch (error) {
      if (error instanceof MailUnavailableError) {
        this.logger.error(
          error.message,
          error.cause instanceof Error ? error.cause.stack : undefined,
        );
      }
      throw error;
    }
  }

  private frontendUrl(): string {
    const configured = this.config.get<string>('APP_PUBLIC_URL');
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    const corsOrigins = this.config.get<string[]>('CORS_ORIGINS') ?? [];
    return (corsOrigins[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  }
}
