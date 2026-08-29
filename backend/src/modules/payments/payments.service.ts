import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import type { Order, OrderItem, Payment } from '../../generated/prisma/client';
import {
  AccessStatus,
  DeliveryType,
  EventProcessingStatus,
  OrderStatus,
  PaymentStatus,
  PayoutStatus,
  ProviderStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildRlsContext,
  SYSTEM_CONTEXT,
  type RlsContext,
} from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import { NodeEnvironment } from '../../config/environment';
import { CommissionsService } from '../commissions/commissions.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  toOrderResponse,
  type OrderResponse,
} from '../orders/dto/order.response';
import { assertOrderTransitionAllowed } from '../orders/order-status';
import {
  FAKE_PROVIDER_CODE,
  FakePaymentDriver,
} from './drivers/fake-payment.driver';
import type { InitializePaymentDto } from './dto/initialize-payment.dto';
import {
  toPaymentResponse,
  type PaymentResponse,
} from './dto/payment.response';
import type { RefundOrderDto } from './dto/refund-order.dto';
import type { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { fromMinorUnits, toMinorUnits } from './money';
import type {
  PaymentOutcome,
  WebhookAccepted,
  WebhookParseResult,
} from './payment-driver';
import { PaymentDriverRegistry } from './payment-driver.registry';

/** Statuts de commande depuis lesquels une tentative de paiement est recevable. */
const PAYABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.awaiting_payment,
  OrderStatus.failed,
];

/** Une tentative dans l'un de ces états est encore en cours : on la réutilise. */
const IN_FLIGHT_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.initialized,
  PaymentStatus.pending,
];

/** Traduction de l'issue annoncée par le pilote vers le statut stocké. */
const OUTCOME_TO_PAYMENT_STATUS: Record<PaymentOutcome, PaymentStatus> = {
  successful: PaymentStatus.successful,
  failed: PaymentStatus.failed,
  cancelled: PaymentStatus.cancelled,
};

const OUTCOME_TO_ORDER_STATUS: Record<PaymentOutcome, OrderStatus> = {
  successful: OrderStatus.paid,
  failed: OrderStatus.failed,
  cancelled: OrderStatus.cancelled,
};

type OrderWithItems = Order & {
  items: Array<OrderItem & { workFormat: { deliveryType: DeliveryType } }>;
};

const orderWithItems = {
  items: { include: { workFormat: { select: { deliveryType: true } } } },
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly drivers: PaymentDriverRegistry,
    private readonly fakeDriver: FakePaymentDriver,
    private readonly activityLog: ActivityLogService,
    private readonly commissions: CommissionsService,
  ) {}

  /**
   * Ouvre une tentative de paiement pour une commande.
   *
   * L'appel au prestataire est délibérément hors transaction : il s'agit d'un
   * aller-retour réseau, et tenir une transaction PostgreSQL ouverte pendant ce
   * temps verrouillerait des lignes pour la durée d'un système tiers.
   */
  async initialize(
    dto: InitializePaymentDto,
    user: AuthenticatedUser,
  ): Promise<PaymentResponse> {
    // `payments`/`orders` sont RLS-protégées (Phase 4) : l'acheteur ne voit et
    // ne modifie que ce qui lui appartient (`user_id = app_current_user_id()`),
    // ce que ce contexte porte tout au long de la méthode.
    const ctx = buildRlsContext(user);

    const order = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.order.findUnique({
        where: { orderNumber: dto.orderNumber },
        include: { user: { select: { email: true } } },
      }),
    );

    // Même politique que `OrdersService.findByNumber` : payer est un acte
    // personnel, personne n'apprend l'existence de la commande d'un autre.
    if (!order || order.userId !== user.id) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    if (!PAYABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        order.status === OrderStatus.paid
          ? 'Cette commande est déjà réglée.'
          : 'Cette commande ne peut plus être payée.',
      );
    }

    const provider = await this.resolveProvider(dto.providerCode);

    // Règle n° 7 : plusieurs tentatives sont permises, mais rien ne justifie d'en
    // ouvrir une seconde tant que la précédente n'a pas abouti ou échoué.
    const inFlight = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.payment.findFirst({
        where: {
          orderId: order.id,
          paymentProviderId: provider.id,
          status: { in: [...IN_FLIGHT_PAYMENT_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );

    if (inFlight) {
      return toPaymentResponse(inFlight, provider.code);
    }

    const payment = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.payment.create({
        data: {
          orderId: order.id,
          paymentProviderId: provider.id,
          idempotencyKey: randomUUID(),
          expectedAmount: order.totalAmount,
          currency: order.currency,
          status: PaymentStatus.initialized,
        },
      }),
    );

    const driver = this.drivers.resolve(provider.code);

    let initialized;
    try {
      initialized = await driver.initialize({
        idempotencyKey: payment.idempotencyKey ?? payment.id,
        orderNumber: order.orderNumber,
        amountMinor: toMinorUnits(order.totalAmount),
        currency: order.currency,
        customerEmail: order.user.email,
        returnUrl: `${this.frontendUrl()}/paiement/${order.orderNumber}`,
      });
    } catch (error) {
      // La tentative reste en base, marquée en échec : une trace vaut mieux qu'un
      // trou dans l'historique quand le prestataire tombe.
      await this.prisma.withRlsContext(ctx, (tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.failed },
        }),
      );
      this.logger.error(
        `Initialisation refusée par le prestataire « ${provider.code} ».`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        "Le service de paiement n'a pas répondu. Veuillez réessayer dans un instant.",
      );
    }

    // `withRlsContext` ouvre déjà une transaction : les deux écritures qui
    // suivent y sont atomiques telles quelles, sans avoir besoin (et sans
    // pouvoir — `Prisma.TransactionClient` n'expose pas `$transaction`,
    // les transactions imbriquées ne sont pas supportées) d'un second
    // `$transaction([...])` par-dessus.
    const updated = await this.prisma.withRlsContext(ctx, async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerTransactionId: initialized.providerTransactionId,
          providerReference: initialized.providerReference,
          checkoutUrl: initialized.checkoutUrl,
          rawResponse: initialized.raw as Prisma.InputJsonValue,
          status: PaymentStatus.pending,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.awaiting_payment },
      });
      return updatedPayment;
    });

    await this.activityLog.record({
      userId: user.id,
      action: 'payment.initialize',
      entityType: 'payment',
      entityId: payment.id,
    });

    return toPaymentResponse(updated, provider.code);
  }

  /** Tentatives de paiement d'une commande, pour son propriétaire uniquement. */
  async listForOrder(
    orderNumber: string,
    user: AuthenticatedUser,
  ): Promise<PaymentResponse[]> {
    const ctx = buildRlsContext(user);

    const order = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.order.findUnique({
        where: { orderNumber },
        select: { id: true, userId: true },
      }),
    );

    if (!order || order.userId !== user.id) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    const payments = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.payment.findMany({
        where: { orderId: order.id },
        include: { paymentProvider: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    return payments.map((payment) =>
      toPaymentResponse(payment, payment.paymentProvider.code),
    );
  }

  /**
   * Séquence de traitement d'une notification, dans l'ordre exact de l'audit §33.
   * L'ordre n'est pas une préférence de style : enregistrer avant de traiter est
   * ce qui permet de diagnostiquer une attaque, et confier l'idempotence à la
   * contrainte unique est ce qui la rend atomique (règles n° 8 et 9).
   */
  async handleWebhook(
    providerCode: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true }> {
    const provider = await this.prisma.paymentProvider.findUnique({
      where: { code: providerCode },
    });
    if (!provider) {
      throw new NotFoundException('Prestataire de paiement inconnu.');
    }

    const driver = this.drivers.resolve(provider.code);
    const parsed = driver.parseWebhook(rawBody, headers);

    // 4. Enregistrer avant de traiter, y compris une notification non signée.
    const event = await this.recordEvent(provider.id, parsed);
    if (!event) {
      // Conflit sur `(payment_provider_id, event_id)` : déjà reçu, donc déjà
      // traité. Répondre 200 pour que le prestataire cesse de réessayer.
      return { received: true };
    }

    // 5. Signature invalide : rien n'est traité, mais la trace reste.
    if (!parsed.signatureValid) {
      await this.closeEvent(
        event.id,
        EventProcessingStatus.failed,
        parsed.reason,
      );
      this.logger.warn(
        `Notification refusée pour « ${provider.code} » : ${parsed.reason}`,
      );
      throw new BadRequestException('Notification de paiement refusée.');
    }

    const payment = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.payment.findUnique({
        where: { providerTransactionId: parsed.transactionId },
        include: { order: { include: orderWithItems } },
      }),
    );

    if (!payment) {
      await this.closeEvent(
        event.id,
        EventProcessingStatus.ignored,
        'Aucune tentative de paiement ne correspond à cette transaction.',
      );
      return { received: true };
    }

    await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentEvent.update({
        where: { id: event.id },
        data: { paymentId: payment.id },
      }),
    );

    // Un prestataire peut notifier deux fois le même succès sous deux identifiants
    // d'événement différents : la contrainte unique ne l'attrape pas, ce contrôle
    // si (règle n° 8, vue depuis la transaction plutôt que depuis l'événement).
    if (payment.status === PaymentStatus.successful) {
      await this.closeEvent(
        event.id,
        EventProcessingStatus.ignored,
        'Ce paiement est déjà confirmé.',
      );
      return { received: true };
    }

    // 6. Le montant reçu doit correspondre au montant attendu (règle n° 10).
    if (
      parsed.outcome === 'successful' &&
      parsed.paidAmountMinor !== toMinorUnits(payment.expectedAmount)
    ) {
      const message = `Montant notifié (${parsed.paidAmountMinor}) différent du montant attendu (${toMinorUnits(payment.expectedAmount)}).`;
      await this.closeEvent(event.id, EventProcessingStatus.failed, message);
      this.logger.error(`Paiement ${payment.id} refusé : ${message}`);
      throw new BadRequestException('Montant de paiement incohérent.');
    }

    const nextOrderStatus = OUTCOME_TO_ORDER_STATUS[parsed.outcome];
    // Contrôlé avant d'ouvrir la transaction : une transition impossible est une
    // anomalie à journaliser, pas une exception à faire remonter d'un `$transaction`.
    try {
      assertOrderTransitionAllowed(payment.order.status, nextOrderStatus);
    } catch {
      await this.closeEvent(
        event.id,
        EventProcessingStatus.ignored,
        `Commande en statut « ${payment.order.status} » : notification sans effet.`,
      );
      return { received: true };
    }

    // 7. Un seul et même engagement pour le paiement, la commande, l'accès du
    // lecteur et l'événement : un paiement confirmé sans droit d'accès est un
    // client mécontent (règle n° 11).
    await this.applyOutcome(event.id, payment, payment.order, parsed);

    return { received: true };
  }

  /**
   * Rembourse intégralement une commande réglée, à la demande d'un administrateur.
   *
   * Le remboursement n'est pas un changement de statut : c'est un mouvement
   * d'argent qui doit aussi retirer au lecteur l'accès qu'il avait acquis. Les
   * trois écritures — paiement, commande, droits d'accès — vont ensemble ou pas
   * du tout (règle n° 11), et l'accès est *révoqué*, jamais supprimé : la
   * commande et ses instantanés restent intacts (règles n° 6 et 18).
   *
   * Le remboursement partiel n'est pas géré : aucun besoin métier ne l'exige
   * aujourd'hui, et un montant partiel change la répartition auteur (phase 10).
   */
  async refund(
    orderId: string,
    dto: RefundOrderDto,
    admin: AuthenticatedUser,
  ): Promise<OrderResponse> {
    // `AdminPaymentsController` est `@Roles('admin')` : platform_admin garanti.
    const ctx: RlsContext = {
      userId: admin.id,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const order = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.order.findUnique({
        where: { id: orderId },
        include: { items: { select: { id: true } } },
      }),
    );

    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    // La machine à états de la phase 7 reste seule juge des transitions permises.
    assertOrderTransitionAllowed(order.status, OrderStatus.refunded);

    const payment = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.payment.findFirst({
        where: { orderId: order.id, status: PaymentStatus.successful },
        include: { paymentProvider: true },
        orderBy: { paidAt: 'desc' },
      }),
    );

    if (!payment?.providerTransactionId) {
      throw new BadRequestException(
        "Cette commande n'a aucun paiement confirmé à rembourser.",
      );
    }

    const driver = this.drivers.resolve(payment.paymentProvider.code);

    // Double condition : ce que le prestataire sait faire (pilote) et ce que
    // l'administration a déclaré (base). Un remboursement lancé contre un
    // prestataire qui ne le gère pas laisserait la commande dans un état faux.
    if (
      !driver.capabilities.supportsRefund ||
      !payment.paymentProvider.supportsRefund
    ) {
      throw new BadRequestException(
        'Ce prestataire de paiement ne gère pas le remboursement en ligne.',
      );
    }

    const refundedAmount = payment.paidAmount ?? payment.expectedAmount;

    // Appel réseau hors transaction, comme à l'initialisation.
    let result;
    try {
      result = await driver.refund(
        payment.providerTransactionId,
        toMinorUnits(refundedAmount),
      );
    } catch (error) {
      this.logger.error(
        `Remboursement refusé par le prestataire « ${payment.paymentProvider.code} » pour le paiement ${payment.id}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        "Le prestataire n'a pas pu traiter le remboursement. Aucune modification n'a été enregistrée.",
      );
    }

    if (!result.refunded) {
      throw new ServiceUnavailableException(
        'Le prestataire a refusé le remboursement.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.prisma.applyRlsContext(tx, ctx);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.refunded },
      });

      // Révocation et non suppression : l'historique d'achat doit rester lisible,
      // seul le droit de lire l'ouvrage disparaît (règle n° 18).
      await tx.readerLibrary.updateMany({
        where: {
          orderItemId: { in: order.items.map((item) => item.id) },
          accessStatus: AccessStatus.active,
        },
        data: { accessStatus: AccessStatus.revoked, revokedAt: now },
      });

      // Phase 7 : un remboursement annule aussi la répartition figée au
      // moment de la vente (`sale_distributions`) — sans cela, une ligne
      // remboursée resterait « available », comme si l'auteur avait encore
      // droit à un montant que le lecteur a récupéré. Seules `pending`/
      // `available` sont concernées : `paid`/`partially_paid` signifieraient
      // qu'un versement a déjà réellement eu lieu, un cas qu'aucun mécanisme
      // actuel ne peut produire (Phase 7, aucun prestataire de reversement
      // intégré) — laissé en l'état plutôt que traité à la légère si un futur
      // mécanisme de paiement le rend un jour possible.
      await tx.saleDistribution.updateMany({
        where: {
          orderItemId: { in: order.items.map((item) => item.id) },
          payoutStatus: { in: [PayoutStatus.pending, PayoutStatus.available] },
        },
        data: { payoutStatus: PayoutStatus.cancelled },
      });

      return tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.refunded },
        include: { items: true },
      });
    });

    await this.activityLog.record({
      userId: admin.id,
      action: 'admin.order.refund',
      entityType: 'order',
      entityId: order.id,
      description: dto.reason,
    });

    return toOrderResponse(updated);
  }

  /**
   * Simule le règlement d'une tentative ouverte chez le prestataire factice.
   *
   * Volontairement interdite en production et limitée au pilote factice : GeBook
   * ne doit jamais pouvoir présenter comme réglé un paiement qui n'a pas eu lieu.
   * La notification produite passe par le chemin de traitement réel — signature
   * comprise —, ce qui en fait une simulation du prestataire, pas un raccourci.
   */
  async simulate(
    paymentId: string,
    dto: SimulatePaymentDto,
    user: AuthenticatedUser,
  ): Promise<{ received: true }> {
    if (
      this.config.getOrThrow<NodeEnvironment>('NODE_ENV') ===
      NodeEnvironment.production
    ) {
      throw new ForbiddenException(
        'La simulation de paiement est désactivée en production.',
      );
    }

    const payment = await this.prisma.withRlsContext(
      buildRlsContext(user),
      (tx) =>
        tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            order: { select: { userId: true } },
            paymentProvider: { select: { code: true } },
          },
        }),
    );

    if (!payment || payment.order.userId !== user.id) {
      throw new NotFoundException("Cette tentative de paiement n'existe pas.");
    }

    if (payment.paymentProvider.code !== FAKE_PROVIDER_CODE) {
      throw new ForbiddenException(
        'Seul le prestataire de simulation accepte un règlement simulé.',
      );
    }

    const rawBody = Buffer.from(
      JSON.stringify({
        eventId: `evt_${randomUUID()}`,
        eventType: `payment.${dto.outcome}`,
        transactionId: payment.providerTransactionId,
        status: dto.outcome,
        amountMinor: toMinorUnits(payment.expectedAmount),
        feeMinor: 0,
        paymentMethod: 'simulation',
      }),
      'utf8',
    );

    return this.handleWebhook(
      FAKE_PROVIDER_CODE,
      rawBody,
      this.fakeDriver.signWebhook(rawBody),
    );
  }

  /**
   * Applique l'issue du paiement en une transaction unique.
   *
   * L'ordre des écritures suit l'audit §33 étape 7. `reader_library` est créé ici
   * plutôt qu'ailleurs parce que le droit d'accès naît du paiement : c'est ce qui
   * rend l'idempotence vérifiable (trois notifications ⇒ un seul accès, règle
   * n° 8) et l'atomicité réelle (règle n° 11). Le figeage des commissions dans
   * `sale_distributions` viendra s'insérer dans cette même transaction en phase 10.
   */
  private async applyOutcome(
    eventId: string,
    payment: Payment,
    order: OrderWithItems,
    parsed: WebhookAccepted,
  ): Promise<void> {
    const succeeded = parsed.outcome === 'successful';
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Traitement système déclenché par un webhook vérifié par signature :
      // aucun utilisateur authentifié, contexte platform_admin (SYSTEM_CONTEXT).
      await this.prisma.applyRlsContext(tx, SYSTEM_CONTEXT);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: OUTCOME_TO_PAYMENT_STATUS[parsed.outcome],
          paidAmount: succeeded
            ? fromMinorUnits(parsed.paidAmountMinor)
            : undefined,
          providerFee: succeeded ? fromMinorUnits(parsed.feeMinor) : undefined,
          paymentMethod: parsed.paymentMethod,
          paidAt: succeeded ? now : undefined,
          rawResponse: parsed.payload as Prisma.InputJsonValue,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OUTCOME_TO_ORDER_STATUS[parsed.outcome],
          paidAt: succeeded ? now : undefined,
          ...(parsed.outcome === 'cancelled' && { cancelledAt: now }),
        },
      });

      if (succeeded) {
        const digitalItems = order.items.filter(
          (item) =>
            item.workFormat.deliveryType === DeliveryType.digital_download,
        );

        if (digitalItems.length > 0) {
          // Sans `skipDuplicates` : un conflit signifierait qu'une autre ligne
          // revendique déjà cet achat. Mieux vaut tout annuler que d'accorder un
          // accès silencieusement incomplet.
          await tx.readerLibrary.createMany({
            data: digitalItems.map((item) => ({
              userId: order.userId,
              orderItemId: item.id,
              workId: item.workId,
              workFormatId: item.workFormatId,
            })),
          });
        }

        // Figeage des commissions, dans la même transaction que le paiement :
        // une vente confirmée sans répartition serait une erreur comptable
        // (règles n° 11 et 13). Les frais réellement facturés par le prestataire
        // sont répartis entre les lignes par le module des commissions.
        await this.commissions.freezeForOrder(tx, {
          items: order.items,
          providerFee: fromMinorUnits(parsed.feeMinor),
          soldAt: now,
        });
      }

      await tx.paymentEvent.update({
        where: { id: eventId },
        data: {
          processingStatus: EventProcessingStatus.processed,
          processedAt: new Date(),
        },
      });
    });
  }

  /**
   * Insère la trace de l'événement. Retourne `null` lorsque la contrainte unique
   * `(payment_provider_id, event_id)` a déjà vu cet événement : c'est la base, et
   * non une vérification applicative, qui porte l'idempotence — elle seule est
   * atomique face à deux notifications simultanées (règle n° 8).
   */
  /**
   * Toujours appelée depuis `handleWebhook` : contexte système
   * (`SYSTEM_CONTEXT`), jamais celui d'un utilisateur authentifié — un webhook
   * de prestataire n'en a pas.
   */
  private async recordEvent(
    providerId: string,
    parsed: WebhookParseResult,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.paymentEvent.create({
          data: {
            paymentProviderId: providerId,
            eventId: parsed.eventId,
            eventType: parsed.eventType,
            payload: parsed.payload ?? {},
            signatureValid: parsed.signatureValid,
            processingStatus: EventProcessingStatus.received,
          },
          select: { id: true },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async closeEvent(
    eventId: string,
    status: EventProcessingStatus,
    message: string,
  ): Promise<void> {
    await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentEvent.update({
        where: { id: eventId },
        data: {
          processingStatus: status,
          errorMessage: message,
          processedAt: new Date(),
        },
      }),
    );
  }

  /**
   * Le prestataire vient du réglage `default_payment_provider`, modifiable par un
   * administrateur sans redéploiement. Il doit être actif en base *et* disposer
   * d'un pilote installé : la base décrit, le code exécute.
   */
  private async resolveProvider(
    requestedCode?: string,
  ): Promise<{ id: string; code: string }> {
    const code = requestedCode ?? (await this.defaultProviderCode());

    const provider = await this.prisma.paymentProvider.findUnique({
      where: { code },
      select: { id: true, code: true, status: true },
    });

    if (!provider || provider.status !== ProviderStatus.active) {
      throw new BadRequestException(
        "Ce moyen de paiement n'est pas disponible.",
      );
    }

    // Lève 503 si aucun pilote n'est installé pour ce code.
    this.drivers.resolve(provider.code);

    return { id: provider.id, code: provider.code };
  }

  private async defaultProviderCode(): Promise<string> {
    const setting = await this.prisma.setting.findUnique({
      where: { settingKey: 'default_payment_provider' },
      select: { settingValue: true },
    });

    if (!setting?.settingValue) {
      throw new ServiceUnavailableException(
        "Aucun prestataire de paiement n'est configuré.",
      );
    }

    return setting.settingValue;
  }

  private frontendUrl(): string {
    return this.config.getOrThrow<string[]>('CORS_ORIGINS')[0];
  }
}
