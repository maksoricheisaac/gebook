import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { Order, OrderItem } from '../../generated/prisma/client';
import { DeliveryType, OrderStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext, type RlsContext } from '../../prisma/rls-context';
import { ActivityLogService } from '../../common/activity-log.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { publiclyVisible } from '../catalog/works.service';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
} from './dto/create-order.dto';
import type {
  AdminListOrdersQuery,
  ListOrdersQuery,
  PaginatedOrdersResponse,
} from './dto/list-orders.query';
import {
  toAdminOrderResponse,
  toOrderResponse,
  type AdminOrderResponse,
  type OrderResponse,
} from './dto/order.response';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { generateOrderNumber } from './order-number';
import { assertOrderTransitionAllowed } from './order-status';

type OrderWithItems = Order & { items: OrderItem[] };

export interface AdminOrderStats {
  total: number;
  paid: number;
  pending: number;
  cancelled: number;
}

const orderInclude = { items: true };
const adminOrderInclude = {
  items: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
};
/** Nombre de tentatives avant d'abandonner en cas de collision de numéro de commande. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async create(dto: CreateOrderDto, userId: string): Promise<OrderResponse> {
    const formatIds = [...new Set(dto.items.map((item) => item.workFormatId))];

    const formats = await this.prisma.workFormat.findMany({
      where: {
        id: { in: formatIds },
        isAvailable: true,
        work: publiclyVisible,
      },
      include: { work: { include: { author: true } } },
    });
    const formatById = new Map(formats.map((format) => [format.id, format]));

    let requiresPhysicalAddress = false;
    let requiresContact = false;

    const itemsData = dto.items.map((item) =>
      this.buildOrderItem(item, formatById, (deliveryType) => {
        if (deliveryType === DeliveryType.physical_delivery) {
          requiresPhysicalAddress = true;
        } else if (deliveryType === DeliveryType.pickup) {
          requiresContact = true;
        }
      }),
    );

    if (requiresPhysicalAddress) {
      this.assertDeliveryDetails(dto, [
        'recipientName',
        'deliveryPhone',
        'deliveryCountry',
        'deliveryCity',
        'deliveryAddress',
      ]);
    } else if (requiresContact) {
      this.assertDeliveryDetails(dto, ['recipientName', 'deliveryPhone']);
    }

    const zero = new Prisma.Decimal(0);
    const subtotal = itemsData.reduce(
      (sum, item) => sum.add(item.lineTotal),
      zero,
    );

    const order = await this.createWithUniqueNumber(userId, dto, itemsData, {
      subtotal,
      deliveryFee: zero,
      discountAmount: zero,
      totalAmount: subtotal,
    });

    await this.activityLog.record({
      userId,
      action: 'order.create',
      entityType: 'order',
      entityId: order.id,
    });

    return toOrderResponse(order);
  }

  async listForUser(
    userId: string,
    query: ListOrdersQuery,
  ): Promise<PaginatedOrdersResponse<OrderResponse>> {
    const where = { userId };
    const ctx: RlsContext = { userId, tenantId: null, isPlatformAdmin: false };

    const [total, data] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.order.count({ where }),
        tx.order.findMany({
          where,
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ]),
    );

    return this.paginate(data.map(toOrderResponse), total, query);
  }

  /**
   * Un lecteur non-admin ne doit jamais apprendre qu'une commande existe s'il n'en
   * est pas le propriétaire : `NotFoundException` dans les deux cas, jamais
   * `ForbiddenException` (qui confirmerait l'existence de la ressource).
   */
  async findByNumber(
    orderNumber: string,
    user: AuthenticatedUser,
  ): Promise<OrderResponse> {
    const isAdmin = user.roles.includes('admin');
    const order = await this.prisma.withRlsContext(
      buildRlsContext(user),
      (tx) =>
        tx.order.findUnique({ where: { orderNumber }, include: orderInclude }),
    );

    if (!order || (!isAdmin && order.userId !== user.id)) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    return toOrderResponse(order);
  }

  /** `AdminOrdersController` est `@Roles('admin')` : platform_admin garanti. */
  async listForAdmin(
    query: AdminListOrdersQuery,
  ): Promise<PaginatedOrdersResponse<AdminOrderResponse>> {
    const where: Prisma.OrderWhereInput = query.status
      ? { status: query.status }
      : {};
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const [total, data] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.order.count({ where }),
        tx.order.findMany({
          where,
          include: adminOrderInclude,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ]),
    );

    return this.paginate(data.map(toAdminOrderResponse), total, query);
  }

  /** `AdminOrdersController` est `@Roles('admin')` : platform_admin garanti. */
  async findOneForAdmin(id: string): Promise<AdminOrderResponse> {
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const order = await this.prisma.withRlsContext(ctx, (tx) =>
      tx.order.findUnique({ where: { id }, include: adminOrderInclude }),
    );
    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    return toAdminOrderResponse(order);
  }

  /**
   * Chiffres de synthèse, calculés en base — jamais déduits d'une page de
   * commandes plafonnée à `perPage`, qui ne reflète qu'un sous-ensemble.
   */
  async statsForAdmin(): Promise<AdminOrderStats> {
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const [total, paid, pending, cancelled] = await this.prisma.withRlsContext(
      ctx,
      (tx) =>
        Promise.all([
          tx.order.count(),
          tx.order.count({ where: { status: 'paid' } }),
          tx.order.count({ where: { status: 'pending' } }),
          tx.order.count({ where: { status: 'cancelled' } }),
        ]),
    );

    return { total, paid, pending, cancelled };
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    adminId: string,
  ): Promise<OrderResponse> {
    const ctx: RlsContext = {
      userId: adminId,
      tenantId: null,
      isPlatformAdmin: true,
    };

    const updated = await this.prisma.withRlsContext(ctx, async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) {
        throw new NotFoundException("Cette commande n'existe pas.");
      }

      // Un remboursement n'est pas un changement de statut : il rend de l'argent
      // chez le prestataire et retire au lecteur son accès. Marquer la commande
      // ici laisserait le paiement « successful » et l'accès actif — une commande
      // remboursée sur le papier seulement. Il passe donc par le module de
      // paiement, qui fait le tout en une transaction.
      if (dto.status === OrderStatus.refunded) {
        throw new BadRequestException(
          'Un remboursement se fait depuis l’action de remboursement, afin de rendre les fonds et de révoquer l’accès du lecteur.',
        );
      }

      assertOrderTransitionAllowed(order.status, dto.status);

      return tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === OrderStatus.paid && { paidAt: new Date() }),
          ...(dto.status === OrderStatus.cancelled && {
            cancelledAt: new Date(),
          }),
        },
        include: orderInclude,
      });
    });

    await this.activityLog.record({
      userId: adminId,
      action: 'admin.order.status',
      entityType: 'order',
      entityId: id,
    });

    return toOrderResponse(updated);
  }

  private buildOrderItem(
    item: CreateOrderItemDto,
    formatById: Map<
      string,
      Prisma.WorkFormatGetPayload<{
        include: { work: { include: { author: true } } };
      }>
    >,
    onDeliveryType: (deliveryType: DeliveryType) => void,
  ): Omit<Prisma.OrderItemCreateManyOrderInput, 'orderNumber'> & {
    lineTotal: Prisma.Decimal;
  } {
    const format = formatById.get(item.workFormatId);
    if (!format) {
      throw new NotFoundException(
        "Un des formats sélectionnés n'existe pas ou n'est plus disponible.",
      );
    }

    if (
      !format.unlimitedStock &&
      format.stockQuantity !== null &&
      item.quantity > format.stockQuantity
    ) {
      throw new BadRequestException(
        `Stock insuffisant pour « ${format.work.title} ».`,
      );
    }

    onDeliveryType(format.deliveryType);

    const lineTotal = format.price.mul(item.quantity);

    return {
      // Instantané du tenant vendeur au moment de l'achat (brief §17) : une même
      // commande peut donc mélanger des lignes de plusieurs tenants.
      tenantId: format.work.tenantId,
      workId: format.workId,
      workFormatId: format.id,
      authorId: format.work.authorId,
      workTitle: format.work.title,
      authorName: format.work.author.penName,
      formatType: format.formatType,
      unitPrice: format.price,
      quantity: item.quantity,
      lineTotal,
    };
  }

  private assertDeliveryDetails(
    dto: CreateOrderDto,
    fields: Array<keyof CreateOrderDto>,
  ): void {
    const missing = fields.some((field) => !dto[field]);
    if (missing) {
      throw new BadRequestException(
        'Les coordonnées de livraison sont incomplètes pour au moins un article de cette commande.',
      );
    }
  }

  private async createWithUniqueNumber(
    userId: string,
    dto: CreateOrderDto,
    itemsData: Array<Omit<Prisma.OrderItemCreateManyOrderInput, 'orderNumber'>>,
    amounts: {
      subtotal: Prisma.Decimal;
      deliveryFee: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    },
  ): Promise<OrderWithItems> {
    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
      const orderNumber = generateOrderNumber();
      try {
        // Transaction : une commande sans ses lignes n'a aucun sens (règle 6, les
        // instantanés de prix et libellé font partie intégrante de la commande).
        // Le contexte RLS est celui de l'acheteur : `orders_insert` et
        // `order_items_insert` exigent `user_id = app_current_user_id()`, quel
        // que soit le tenant vendeur de chaque ligne (panier multi-tenant).
        return await this.prisma.$transaction(async (tx) => {
          await this.prisma.applyRlsContext(tx, {
            userId,
            tenantId: null,
            isPlatformAdmin: false,
          });
          return tx.order.create({
            data: {
              orderNumber,
              userId,
              status: OrderStatus.pending,
              subtotal: amounts.subtotal,
              deliveryFee: amounts.deliveryFee,
              discountAmount: amounts.discountAmount,
              totalAmount: amounts.totalAmount,
              recipientName: dto.recipientName,
              deliveryPhone: dto.deliveryPhone,
              deliveryCountry: dto.deliveryCountry,
              deliveryCity: dto.deliveryCity,
              deliveryDistrict: dto.deliveryDistrict,
              deliveryAddress: dto.deliveryAddress,
              deliveryLandmark: dto.deliveryLandmark,
              items: {
                createMany: {
                  data: itemsData.map((item) => ({ ...item, orderNumber })),
                },
              },
            },
            include: orderInclude,
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Impossible de générer un numéro de commande unique.',
    );
  }

  private paginate<T>(
    data: T[],
    total: number,
    query: { page: number; perPage: number },
  ): PaginatedOrdersResponse<T> {
    return {
      data,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }
}
