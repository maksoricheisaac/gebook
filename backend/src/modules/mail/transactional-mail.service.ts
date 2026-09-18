import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml, renderEmailLayout } from './email-layout';
import { MailService, MailUnavailableError } from './mail.service';

export interface MailRecipient {
  email: string;
  firstName: string;
}

/**
 * Tous les e-mails transactionnels « notification » (brief §1), c'est-à-dire
 * tout ce qui n'est pas déjà couvert par `EmailVerificationService` /
 * `LoginOtpService` (où l'e-mail EST l'opération, et doit donc faire échouer
 * l'appelant s'il échoue).
 *
 * Ici, à l'inverse : l'action métier (commande créée, livre approuvé, retrait
 * demandé…) est déjà écrite en base quand ces méthodes sont appelées. Un échec
 * SMTP ne doit donc jamais annuler ou faire échouer cette action — seulement
 * être journalisé, sur le même principe que `TeamService.sendInviteEmail`.
 * Chaque appelant ne déclenche l'envoi qu'une seule fois, au point exact de la
 * transition d'état qu'il notifie (commande créée, webhook de paiement traité
 * une seule fois grâce à l'idempotence de `PaymentEvent`, changement de statut
 * d'une œuvre…) — jamais depuis une boucle de relecture ou un nouvel essai.
 */
@Injectable()
export class TransactionalMailService {
  private readonly logger = new Logger(TransactionalMailService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------
  // Lecteur
  // ---------------------------------------------------------------------

  async sendAccountCreated(user: MailRecipient): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Votre compte GeBook a été créé.',
          heading: 'Bienvenue sur GeBook',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            'Votre compte GeBook vient d’être créé. Un e-mail de vérification séparé vous permettra d’activer pleinement votre accès.',
          ],
          ctaLabel: 'Découvrir le catalogue',
          ctaUrl: `${this.frontendUrl()}/livres`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Bienvenue sur GeBook', action: 'compte créé' },
    );
  }

  async sendOrderConfirmation(
    user: MailRecipient,
    order: { orderNumber: string; totalAmount: string; currency: string },
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Votre commande ${order.orderNumber} a été enregistrée.`,
          heading: 'Votre commande a été enregistrée',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Nous avons bien enregistré votre commande <strong>${escapeHtml(order.orderNumber)}</strong>, d’un montant de ${formatAmount(order.totalAmount, order.currency)}.`,
            'Vous recevrez un second e-mail dès que le paiement sera confirmé.',
          ],
          ctaLabel: 'Voir ma commande',
          ctaUrl: `${this.frontendUrl()}/paiement/${order.orderNumber}`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: `Commande ${order.orderNumber} enregistrée — GeBook`,
        action: 'commande enregistrée',
      },
    );
  }

  async sendPaymentConfirmation(
    user: MailRecipient,
    order: { orderNumber: string; totalAmount: string; currency: string },
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Le paiement de votre commande ${order.orderNumber} est confirmé.`,
          heading: 'Paiement confirmé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Le paiement de votre commande <strong>${escapeHtml(order.orderNumber)}</strong> (${formatAmount(order.totalAmount, order.currency)}) est confirmé.`,
            'Vos achats numériques sont désormais disponibles dans votre bibliothèque.',
          ],
          ctaLabel: 'Voir ma commande',
          ctaUrl: `${this.frontendUrl()}/paiement/${order.orderNumber}`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: `Paiement confirmé — commande ${order.orderNumber} — GeBook`,
        action: 'paiement confirmé',
      },
    );
  }

  async sendPaymentFailed(
    user: MailRecipient,
    order: { orderNumber: string },
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Le paiement de votre commande ${order.orderNumber} a échoué.`,
          heading: 'Le paiement n’a pas abouti',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Le paiement de votre commande <strong>${escapeHtml(order.orderNumber)}</strong> n’a pas pu être confirmé. Aucun montant n’a été débité durablement.`,
            'Vous pouvez retenter le règlement depuis votre commande.',
          ],
          ctaLabel: 'Réessayer le paiement',
          ctaUrl: `${this.frontendUrl()}/paiement/${order.orderNumber}`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: `Paiement échoué — commande ${order.orderNumber} — GeBook`,
        action: 'paiement échoué',
      },
    );
  }

  async sendDigitalBooksAvailable(
    user: MailRecipient,
    workTitles: string[],
  ): Promise<void> {
    if (workTitles.length === 0) return;
    const list = workTitles
      .map((title) => `• ${escapeHtml(title)}`)
      .join('<br />');
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Vos livres numériques sont disponibles.',
          heading: 'Vos livres sont disponibles',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Les livres numériques suivants sont maintenant disponibles dans votre bibliothèque :<br />${list}`,
          ],
          ctaLabel: 'Ouvrir ma bibliothèque',
          ctaUrl: `${this.frontendUrl()}/bibliotheque`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: 'Vos livres sont disponibles — GeBook',
        action: 'livre disponible',
      },
    );
  }

  async sendRefundCompleted(
    user: MailRecipient,
    order: { orderNumber: string; totalAmount: string; currency: string },
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Votre commande ${order.orderNumber} a été remboursée.`,
          heading: 'Remboursement effectué',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre commande <strong>${escapeHtml(order.orderNumber)}</strong> (${formatAmount(order.totalAmount, order.currency)}) a été remboursée. L’accès aux livres numériques de cette commande a été retiré.`,
          ],
          ctaLabel: 'Voir ma commande',
          ctaUrl: `${this.frontendUrl()}/paiement/${order.orderNumber}`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: `Remboursement effectué — commande ${order.orderNumber} — GeBook`,
        action: 'remboursement effectué',
      },
    );
  }

  // ---------------------------------------------------------------------
  // Auteur
  // ---------------------------------------------------------------------

  async sendSpaceCreated(
    user: MailRecipient,
    tenantName: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Votre espace « ${tenantName} » a été créé sur GeBook.`,
          heading: 'Votre espace a été créé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre espace « <strong>${escapeHtml(tenantName)}</strong> » a été créé. Vous pouvez dès maintenant publier vos premiers livres.`,
          ],
          ctaLabel: 'Accéder à mon espace',
          ctaUrl: `${this.frontendUrl()}/admin`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Votre espace GeBook a été créé', action: 'espace créé' },
    );
  }

  async sendWorkSubmitted(
    user: MailRecipient,
    workTitle: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `« ${workTitle} » a été soumis à la modération.`,
          heading: 'Livre soumis à la modération',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre livre « <strong>${escapeHtml(workTitle)}</strong> » a été soumis et sera examiné avant publication.`,
          ],
          ctaLabel: 'Suivre mes livres',
          ctaUrl: `${this.frontendUrl()}/admin/oeuvres`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: 'Livre soumis à la modération — GeBook',
        action: 'livre soumis',
      },
    );
  }

  async sendWorkApproved(
    user: MailRecipient,
    workTitle: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `« ${workTitle} » a été approuvé.`,
          heading: 'Livre approuvé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Bonne nouvelle : votre livre « <strong>${escapeHtml(workTitle)}</strong> » a été approuvé.`,
          ],
          ctaLabel: 'Gérer mes livres',
          ctaUrl: `${this.frontendUrl()}/admin/oeuvres`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Livre approuvé — GeBook', action: 'livre approuvé' },
    );
  }

  async sendWorkRejected(
    user: MailRecipient,
    workTitle: string,
    reason: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `« ${workTitle} » n’a pas été approuvé.`,
          heading: 'Livre non approuvé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre livre « <strong>${escapeHtml(workTitle)}</strong> » n’a pas été approuvé, pour le motif suivant :`,
            `« ${escapeHtml(reason)} »`,
          ],
          ctaLabel: 'Modifier mon livre',
          ctaUrl: `${this.frontendUrl()}/admin/oeuvres`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Livre non approuvé — GeBook', action: 'livre rejeté' },
    );
  }

  async sendNewSale(
    user: MailRecipient,
    workTitle: string,
    netAmount: string,
    currency: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: `Nouvelle vente de « ${workTitle} ».`,
          heading: 'Nouvelle vente',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre livre « <strong>${escapeHtml(workTitle)}</strong> » vient d’être vendu. Votre part nette de cette vente : ${formatAmount(netAmount, currency)}.`,
          ],
          ctaLabel: 'Voir mes ventes',
          ctaUrl: `${this.frontendUrl()}/auteur/tableau-de-bord`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Nouvelle vente — GeBook', action: 'nouvelle vente' },
    );
  }

  async sendPayoutRequested(
    user: MailRecipient,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Votre demande de retrait a été reçue.',
          heading: 'Demande de retrait reçue',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre demande de retrait de ${formatAmount(amount, currency)} a bien été reçue et sera examinée par l’équipe GeBook.`,
          ],
          ctaLabel: 'Suivre ma demande',
          ctaUrl: `${this.frontendUrl()}/admin/retraits`,
          logoUrl: this.logoUrl(),
        }),
      {
        subject: 'Demande de retrait reçue — GeBook',
        action: 'retrait demandé',
      },
    );
  }

  async sendPayoutApproved(
    user: MailRecipient,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Votre demande de retrait a été approuvée.',
          heading: 'Retrait approuvé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre demande de retrait de ${formatAmount(amount, currency)} a été approuvée et sera traitée prochainement.`,
          ],
          ctaLabel: 'Suivre ma demande',
          ctaUrl: `${this.frontendUrl()}/admin/retraits`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Retrait approuvé — GeBook', action: 'retrait approuvé' },
    );
  }

  async sendPayoutRejected(
    user: MailRecipient,
    amount: string,
    currency: string,
    reason: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Votre demande de retrait a été refusée.',
          heading: 'Retrait refusé',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre demande de retrait de ${formatAmount(amount, currency)} a été refusée, pour le motif suivant :`,
            `« ${escapeHtml(reason)} »`,
          ],
          ctaLabel: 'Voir mes retraits',
          ctaUrl: `${this.frontendUrl()}/admin/retraits`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Retrait refusé — GeBook', action: 'retrait refusé' },
    );
  }

  async sendPayoutPaid(
    user: MailRecipient,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.dispatch(
      user.email,
      () =>
        renderEmailLayout({
          previewText: 'Votre retrait a été versé.',
          heading: 'Retrait effectué',
          paragraphs: [
            `Bonjour ${escapeHtml(user.firstName)},`,
            `Votre retrait de ${formatAmount(amount, currency)} a été versé.`,
          ],
          ctaLabel: 'Voir mes retraits',
          ctaUrl: `${this.frontendUrl()}/admin/retraits`,
          logoUrl: this.logoUrl(),
        }),
      { subject: 'Retrait effectué — GeBook', action: 'retrait effectué' },
    );
  }

  // ---------------------------------------------------------------------

  private async dispatch(
    to: string,
    buildHtml: () => string,
    meta: { subject: string; action: string },
  ): Promise<void> {
    try {
      await this.mail.send({ to, subject: meta.subject, html: buildHtml() });
    } catch (error) {
      if (error instanceof MailUnavailableError) {
        this.logger.warn(
          `Notification « ${meta.action} » non envoyée à ${to} : ${error.message}`,
        );
        return;
      }
      this.logger.warn(
        `Notification « ${meta.action} » non envoyée à ${to} : erreur inattendue.`,
      );
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

  private logoUrl(): string {
    return `${this.frontendUrl()}/logo_gebook.png`;
  }
}

function formatAmount(amount: string, currency: string): string {
  const numeric = Number(amount);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
    : amount;
  return `${formatted} ${currency}`;
}
