/**
 * Tests MOCKÉS du flux PayIn dans `PaymentsService` : Prisma et le pilote sont
 * des doubles. Ils vérifient la logique (idempotence, timeout ≠ échec,
 * PENDING ≠ payé), pas un paiement réel FeexPay.
 */
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { OrderStatus, PaymentStatus } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PaymentsService } from './payments.service';
import { PaymentRejectedByProvider, ProviderTimeout } from './provider-errors';

const USER: AuthenticatedUser = {
  id: 'user-1',
  firstName: 'A',
  lastName: null,
  email: 'a@example.test',
  roles: [],
};

const ORDER = {
  id: 'order-1',
  orderNumber: 'GB-1',
  userId: 'user-1',
  status: OrderStatus.pending,
  totalAmount: new Prisma.Decimal(5000),
  currency: 'XAF',
  user: { email: 'a@example.test' },
  items: [],
};

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    paymentProviderId: 'prov-1',
    providerTransactionId: null,
    providerReference: null,
    idempotencyKey: 'key-1',
    checkoutUrl: null,
    expectedAmount: new Prisma.Decimal(5000),
    paidAmount: null,
    providerFee: null,
    currency: 'XAF',
    paymentMethod: null,
    status: PaymentStatus.initialized,
    rawResponse: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function build() {
  const tx = {
    order: {
      findUnique: jest.fn().mockResolvedValue(ORDER),
      update: jest.fn().mockResolvedValue(ORDER),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn().mockResolvedValue(paymentRow()),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(paymentRow(data)),
        ),
    },
  };
  const prisma = {
    withRlsContext: jest.fn((_ctx: unknown, fn: (t: typeof tx) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
    paymentProvider: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'prov-1', code: 'feexpay', status: 'active' }),
    },
    setting: { findUnique: jest.fn() },
  };
  const driver = {
    code: 'feexpay',
    initialize: jest.fn(),
    verify: jest.fn(),
  };
  const drivers = { resolve: jest.fn().mockReturnValue(driver) };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(['http://localhost:3000']),
  };
  const activityLog = { recordForOrder: jest.fn() };

  const service = new PaymentsService(
    prisma as never,
    config as never,
    drivers as never,
    {} as never,
    activityLog as never,
    {} as never,
    {} as never,
  );
  return { service, tx, prisma, driver };
}

const dto = {
  orderNumber: 'GB-1',
  providerCode: 'feexpay',
  customerPhone: '242061234567',
  providerChannel: 'mtn_cg',
};

describe('PaymentsService — PayIn FeexPay (mocké)', () => {
  describe('initialize', () => {
    it('crée la tentative PENDING avec la référence FeexPay', async () => {
      const { service, driver, tx } = build();
      driver.initialize.mockResolvedValue({
        providerTransactionId: 'mock-reference',
        providerReference: 'mock-reference',
        checkoutUrl: null,
        raw: { reference: 'mock-reference', status: 'PENDING' },
      });

      const result = await service.initialize(dto, USER);

      expect(result.status).toBe(PaymentStatus.pending);
      expect(driver.initialize).toHaveBeenCalledTimes(1);
      // Le montant vient de la commande, jamais du client.
      expect(driver.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 500000,
        }),
      );
      expect(tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.awaiting_payment },
        }),
      );
    });

    it('même commande soumise deux fois : renvoie la tentative en cours', async () => {
      const { service, driver, tx } = build();
      tx.payment.findFirst.mockResolvedValue(
        paymentRow({
          status: PaymentStatus.pending,
          providerTransactionId: 'mock-reference',
        }),
      );

      const result = await service.initialize(dto, USER);

      expect(result.status).toBe(PaymentStatus.pending);
      expect(driver.initialize).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('deux requêtes concurrentes : le perdant de la course reçoit la tentative gagnante', async () => {
      const { service, driver, tx } = build();
      const winner = paymentRow({ id: 'pay-winner' });
      tx.payment.findFirst
        .mockResolvedValueOnce(null) // lecture initiale : rien
        .mockResolvedValueOnce(winner); // relecture après conflit
      tx.payment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const result = await service.initialize(dto, USER);

      expect(result.id).toBe('pay-winner');
      expect(driver.initialize).not.toHaveBeenCalled();
    });

    it('timeout ≠ échec : la tentative n’est PAS marquée failed', async () => {
      const { service, driver, tx } = build();
      driver.initialize.mockRejectedValue(new ProviderTimeout('feexpay'));

      await expect(service.initialize(dto, USER)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      const marksFailed = tx.payment.update.mock.calls.some(
        ([arg]: [{ data: { status?: string } }]) =>
          arg.data.status === PaymentStatus.failed,
      );
      expect(marksFailed).toBe(false);
    });

    it('après un timeout, une relance immédiate ne rappelle pas FeexPay', async () => {
      const { service, driver, tx } = build();
      tx.payment.findFirst.mockResolvedValue(
        paymentRow({ status: PaymentStatus.initialized }),
      );

      await service.initialize(dto, USER);

      expect(driver.initialize).not.toHaveBeenCalled();
    });

    it('refus définitif (montant) : failed + 400 avec message sûr', async () => {
      const { service, driver, tx } = build();
      driver.initialize.mockRejectedValue(
        new PaymentRejectedByProvider(
          'feexpay',
          'ERR_INVALID_AMOUNT',
          'Montant refusé.',
        ),
      );

      await expect(service.initialize(dto, USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PaymentStatus.failed } }),
      );
    });

    it('refus de configuration (401) : 503 sans détail prestataire', async () => {
      const { service, driver } = build();
      driver.initialize.mockRejectedValue(
        new PaymentRejectedByProvider(
          'feexpay',
          'ERR_INVALID_API_KEY',
          'Service indisponible.',
        ),
      );

      await expect(service.initialize(dto, USER)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('syncStatus', () => {
    const pending = paymentRow({
      status: PaymentStatus.pending,
      providerTransactionId: 'mock-reference',
      order: { userId: 'user-1' },
      paymentProvider: { id: 'prov-1', code: 'feexpay' },
    });

    it('PENDING : ne change rien, aucun événement, commande non payée', async () => {
      const { service, driver, tx } = build();
      tx.payment.findUnique.mockResolvedValue(pending);
      driver.verify.mockResolvedValue({
        transactionId: 'mock-reference',
        outcome: 'pending',
        paidAmountMinor: 0,
        feeMinor: 0,
        raw: {},
      });

      const result = await service.syncStatus('pay-1', USER);

      expect(result.status).toBe(PaymentStatus.pending);
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('erreur d’interrogation : 503, paiement intact', async () => {
      const { service, driver, tx } = build();
      tx.payment.findUnique.mockResolvedValue(pending);
      driver.verify.mockRejectedValue(new ProviderTimeout('feexpay'));

      await expect(service.syncStatus('pay-1', USER)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('paiement d’un autre utilisateur : introuvable', async () => {
      const { service, tx } = build();
      tx.payment.findUnique.mockResolvedValue({
        ...pending,
        order: { userId: 'someone-else' },
      });

      await expect(service.syncStatus('pay-1', USER)).rejects.toThrow(
        /n'existe pas/,
      );
    });

    it('statut déjà final : aucun appel au prestataire', async () => {
      const { service, driver, tx } = build();
      tx.payment.findUnique.mockResolvedValue({
        ...pending,
        status: PaymentStatus.successful,
      });

      const result = await service.syncStatus('pay-1', USER);

      expect(result.status).toBe(PaymentStatus.successful);
      expect(driver.verify).not.toHaveBeenCalled();
    });

    it('sans référence prestataire : rien à interroger', async () => {
      const { service, driver, tx } = build();
      tx.payment.findUnique.mockResolvedValue({
        ...pending,
        providerTransactionId: null,
      });

      await service.syncStatus('pay-1', USER);

      expect(driver.verify).not.toHaveBeenCalled();
    });
  });
});
