import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { escapeHtml, renderEmailLayout } from '../mail/email-layout';
import { MailService, MailUnavailableError } from '../mail/mail.service';

/** Court, contrairement au lien de vérification d'adresse (24h) : un code de
 * connexion se saisit dans la foulée de la tentative qui l'a déclenché, pas
 * consulté le lendemain. */
const OTP_TTL_MINUTES = 10;
const OTP_LENGTH = 6;

export interface LoginOtpRecipient {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Code de connexion à usage unique (OTP), envoyé par e-mail à chaque
 * connexion réussie (audit pré-production : le mot de passe seul ne suffit
 * plus, une seconde preuve de possession de la boîte mail est exigée à
 * chaque fois — distinct de la vérification d'adresse à l'inscription, qui
 * ne se produit qu'une fois). Même principe que `EmailVerificationService` :
 * seul le hachage SHA-256 du code est stocké, jamais le code lui-même.
 */
@Injectable()
export class LoginOtpService {
  private readonly logger = new Logger(LoginOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Génère un nouveau code et envoie l'e-mail correspondant. Les codes
   * précédents du compte sont invalidés au passage : un seul code valide à
   * la fois, celui du dernier e-mail reçu.
   */
  async send(user: LoginOtpRecipient): Promise<void> {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.loginOtp.deleteMany({ where: { userId: user.id } }),
      this.prisma.loginOtp.create({
        data: { userId: user.id, codeHash: hashCode(code), expiresAt },
      }),
    ]);

    const frontendUrl = this.frontendUrl();
    const firstName = escapeHtml(user.firstName);
    // Espacé pour une lecture plus facile ("123 456"), sans rapport avec la
    // valeur réellement comparée à la vérification (les espaces sont retirés
    // avant hachage/comparaison côté `verify()`/DTO).
    const displayCode = `${code.slice(0, 3)} ${code.slice(3)}`;

    const html = renderEmailLayout({
      previewText: `Votre code de connexion GeBook : ${code}`,
      heading: 'Votre code de connexion',
      paragraphs: [
        `Bonjour ${firstName},`,
        'Voici le code à saisir pour terminer votre connexion :',
        `<span style="display:inline-block;margin:4px 0;font-size:28px;font-weight:700;letter-spacing:6px;color:#07264a;">${displayCode}</span>`,
      ],
      ctaLabel: 'Saisir mon code',
      ctaUrl: `${frontendUrl}/connexion/code?email=${encodeURIComponent(user.email)}`,
      footnote: `Ce code est valable ${OTP_TTL_MINUTES} minutes. Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet e-mail et envisagez de changer votre mot de passe.`,
      logoUrl: `${frontendUrl}/logo_gebook.png`,
    });

    try {
      await this.mail.send({
        to: user.email,
        subject: 'Votre code de connexion — GeBook',
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
   * Un code déjà envoyé et encore valide existe-t-il pour ce compte ? Même
   * raisonnement que `EmailVerificationService.hasPendingToken()` : évite
   * qu'une nouvelle tentative de connexion pendant que le premier code est
   * encore valide n'en invalide l'e-mail que la personne vient de recevoir.
   */
  async hasPendingCode(userId: string): Promise<boolean> {
    const record = await this.prisma.loginOtp.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return record !== null;
  }

  /**
   * Vérifie le code fourni pour ce compte. Le code n'est consommé (supprimé)
   * qu'en cas de succès — un code faux doit pouvoir être retenté (jusqu'à la
   * limite posée par `LoginThrottleService`), pas invalidé au premier essai.
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const record = await this.prisma.loginOtp.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.expiresAt <= new Date()) {
      return false;
    }

    // Comparaison à temps constant : la longueur du hachage est fixe (SHA-256,
    // toujours 64 caractères hexadécimaux), `timingSafeEqual` exige des
    // buffers de même taille, jamais garanti pour une entrée arbitraire.
    const provided = Buffer.from(hashCode(normalizeCode(code)));
    const expected = Buffer.from(record.codeHash);
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(provided, expected);

    if (!valid) {
      return false;
    }

    await this.prisma.loginOtp.deleteMany({ where: { userId } });
    return true;
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

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

/** Retire les espaces qu'un utilisateur peut recopier depuis l'e-mail
 * ("123 456") avant de comparer/hacher — jamais avant l'affichage. */
function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
