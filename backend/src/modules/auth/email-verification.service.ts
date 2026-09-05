import { randomBytes, createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { escapeHtml, renderEmailLayout } from '../mail/email-layout';
import { MailService, MailUnavailableError } from '../mail/mail.service';

/** Durée de validité du lien de vérification — plus longue qu'un code à usage
 * unique (brief §2) car c'est un lien, pensé pour être ouvert plus tard que
 * l'instant de l'envoi (boîte mail consultée le lendemain, par exemple). */
const VERIFICATION_TOKEN_TTL_HOURS = 24;

export interface EmailVerificationRecipient {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Vérification d'adresse e-mail à l'inscription (brief §1), sur le même
 * principe que `SessionService` : seul le hachage SHA-256 du jeton est stocké,
 * jamais le jeton lui-même envoyé par e-mail — une fuite de la base ne suffit
 * pas à vérifier un compte à la place de son propriétaire.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Génère un nouveau jeton et envoie l'e-mail correspondant. Les jetons
   * précédents du compte sont invalidés au passage : un seul lien valide à la
   * fois, celui du dernier e-mail reçu.
   */
  async send(user: EmailVerificationRecipient): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      }),
      this.prisma.emailVerificationToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    const frontendUrl = this.frontendUrl();
    const verifyUrl = `${frontendUrl}/verifier-email?token=${token}`;
    const firstName = escapeHtml(user.firstName);

    const html = renderEmailLayout({
      previewText:
        'Confirmez votre adresse e-mail pour activer votre compte GeBook.',
      heading: 'Confirmez votre adresse e-mail',
      paragraphs: [
        `Bonjour ${firstName},`,
        'Merci de votre inscription sur GeBook. Il ne reste qu’une étape avant de retrouver vos commandes et votre bibliothèque numérique : confirmer votre adresse e-mail.',
      ],
      ctaLabel: 'Confirmer mon adresse e-mail',
      ctaUrl: verifyUrl,
      footnote: `Ce lien est valable ${VERIFICATION_TOKEN_TTL_HOURS} heures. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.`,
      logoUrl: `${frontendUrl}/logo_gebook.png`,
    });

    try {
      await this.mail.send({
        to: user.email,
        subject: 'Confirmez votre adresse e-mail — GeBook',
        html,
      });
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

  /**
   * Consomme un jeton de vérification : marque le compte comme vérifié et
   * supprime le jeton (usage unique). Renvoie l'identifiant utilisateur, ou
   * `null` si le jeton est inconnu ou expiré.
   */
  async consume(token: string): Promise<{ userId: string } | null> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!record || record.expiresAt <= new Date()) {
      return null;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: record.userId },
      }),
    ]);

    return { userId: record.userId };
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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
