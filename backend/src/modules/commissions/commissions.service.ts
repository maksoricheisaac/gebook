import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  CommissionRuleStatus,
  PayoutStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRlsContext } from '../../prisma/rls-context';
import type { RlsContext } from '../../prisma/rls-context';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TENANT_FINANCE_ROLES } from '../tenants/tenant-context';
import type { TenantContext } from '../tenants/tenant-context';
import {
  allocateProviderFee,
  computeDistribution,
  selectRule,
} from './commission';
import type { DateRangeQuery } from './dto/date-range.query';

/**
 * Résout une période demandée en bornes concrètes, par défaut les 30 derniers
 * jours — reprend le défaut historique de `revenueTimeseries()` plutôt que
 * d'imposer une période obligatoire à tous les appelants existants.
 */
function resolveDateRange(query?: DateRangeQuery): { from: Date; to: Date } {
  const to = query?.to ? new Date(query.to) : new Date();
  const from = query?.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Aligné sur la policy RLS `sale_distributions_select` (owner/admin/finance, ou platform_admin). */
function assertCanViewTenantFinance(tenant: TenantContext): string {
  if (tenant.isPlatformAdmin) {
    if (!tenant.tenantId) {
      throw new ForbiddenException(
        "Sélectionnez d'abord une maison d'édition active.",
      );
    }
    return tenant.tenantId;
  }
  if (
    !tenant.tenantId ||
    !tenant.role ||
    !TENANT_FINANCE_ROLES.includes(tenant.role)
  ) {
    throw new ForbiddenException(
      'Votre rôle ne permet pas de consulter les ventes de cet espace.',
    );
  }
  return tenant.tenantId;
}

/** Ce dont le figeage a besoin d'une ligne de commande, et rien de plus. */
export interface FreezableItem {
  id: string;
  authorId: string;
  lineTotal: Prisma.Decimal;
  quantity: number;
}

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fige la répartition de chaque ligne d'une commande réglée.
   *
   * Appelée **dans la transaction du paiement** : une vente confirmée sans
   * répartition est une erreur comptable, et une répartition sans paiement
   * confirmé serait une créance imaginaire (règle n° 11).
   *
   * Les montants sont écrits, jamais une référence à recalculer : changer une
   * règle plus tard ne touche donc aucune vente passée (règle n° 13), et
   * supprimer la règle laisse les montants intacts grâce au `SET NULL` porté par
   * le schéma (règle n° 14).
   *
   * L'unicité de `order_item_id` interdit une seconde répartition sur la même
   * ligne (règle n° 15) ; comme la transaction n'est atteinte qu'une fois par
   * notification acceptée, un rejeu ne la déclenche jamais.
   */
  async freezeForOrder(
    tx: Prisma.TransactionClient,
    params: {
      items: FreezableItem[];
      /** Frais réellement facturés par le prestataire pour toute la commande. */
      providerFee: Prisma.Decimal;
      soldAt: Date;
    },
  ): Promise<void> {
    if (params.items.length === 0) {
      return;
    }

    // Toutes les règles en vigueur sont chargées une fois : le choix ligne à
    // ligne se fait ensuite en mémoire, par une fonction pure et testable.
    const rules = await tx.commissionRule.findMany({
      where: {
        status: CommissionRuleStatus.active,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.soldAt } }],
      },
    });

    const fees = allocateProviderFee(
      params.items.map((item) => item.lineTotal),
      params.providerFee,
    );

    const data = params.items.map((item, index) => {
      const rule = selectRule(rules, item.authorId, params.soldAt);
      const distribution = computeDistribution({
        grossAmount: item.lineTotal,
        providerFee: fees[index],
        quantity: item.quantity,
        rule,
      });

      return {
        orderItemId: item.id,
        authorId: item.authorId,
        commissionRuleId: distribution.commissionRuleId,
        grossAmount: distribution.grossAmount,
        providerFee: distribution.providerFee,
        netAfterProviderFee: distribution.netAfterProviderFee,
        gebookCommissionRate: distribution.gebookCommissionRate,
        gebookCommissionAmount: distribution.gebookCommissionAmount,
        authorNetAmount: distribution.authorNetAmount,
        calculatedAt: params.soldAt,
        // Phase 7 : aucun prestataire de reversement n'existe encore — en
        // attendant, une vente confirmée est directement « disponible »
        // plutôt que bloquée indéfiniment en « pending » (qui n'aurait
        // jamais de mécanisme pour en sortir). `available` reste réversible :
        // un remboursement la fait passer à `cancelled`
        // (`PaymentsService.refund`) ; rien ici ne prétend qu'un versement a
        // réellement eu lieu — voir le commentaire de `PayoutStatus` côté
        // schéma et `GEBOOK_PROGRESS.md` (Phase 7) pour la décision et son
        // alternative (délai de rétention avant disponibilité), non tranchée
        // faute de règle métier explicite à appliquer.
        payoutStatus: PayoutStatus.available,
      };
    });

    await tx.saleDistribution.createMany({ data });
  }

  /** Ventes d'un auteur, de la plus récente à la plus ancienne. */
  async listSales(
    authorId: string,
    query: { page: number; perPage: number },
    ctx: RlsContext,
  ): Promise<{
    data: AuthorSaleResponse[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }> {
    const where = { authorId };

    const [total, sales] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.saleDistribution.count({ where }),
        tx.saleDistribution.findMany({
          where,
          include: {
            // `orderNumber` est un instantané sur `order_items` lui-même
            // (Phase 4) : pas besoin d'inclure la relation `order` (RLS),
            // ce qui évite par la même occasion la récursion de policies
            // documentée dans le schéma sur ce champ.
            orderItem: {
              select: {
                workTitle: true,
                formatType: true,
                quantity: true,
                orderNumber: true,
              },
            },
          },
          orderBy: { calculatedAt: 'desc' },
          skip: (query.page - 1) * query.perPage,
          take: query.perPage,
        }),
      ]),
    );

    return {
      data: sales.map((sale) => ({
        id: sale.id,
        orderNumber: sale.orderItem.orderNumber,
        workTitle: sale.orderItem.workTitle,
        formatType: sale.orderItem.formatType,
        quantity: sale.orderItem.quantity,
        grossAmount: sale.grossAmount.toFixed(2),
        providerFee: sale.providerFee.toFixed(2),
        gebookCommissionAmount: sale.gebookCommissionAmount.toFixed(2),
        authorNetAmount: sale.authorNetAmount.toFixed(2),
        payoutStatus: sale.payoutStatus,
        soldAt: sale.calculatedAt.toISOString(),
      })),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  /**
   * Revenus cumulés d'un auteur.
   *
   * Les totaux sont demandés à PostgreSQL plutôt que reconstitués en mémoire :
   * additionner des `Decimal` page par page finirait par diverger, et la base
   * sait le faire exactement.
   */
  async revenue(
    authorId: string,
    ctx: RlsContext,
  ): Promise<AuthorRevenueResponse> {
    // Phase 7 : `cancelled` (remboursement, `PaymentsService.refund`) exclu
    // des totaux cumulés — une vente annulée ne doit plus compter dans le
    // revenu de l'auteur, exactement comme elle ne compte plus dans son
    // solde disponible.
    const [totals, pending, available] = await this.prisma.withRlsContext(
      ctx,
      (tx) =>
        Promise.all([
          tx.saleDistribution.aggregate({
            where: { authorId, payoutStatus: { not: 'cancelled' } },
            _sum: {
              grossAmount: true,
              gebookCommissionAmount: true,
              authorNetAmount: true,
            },
            _count: true,
          }),
          tx.saleDistribution.aggregate({
            where: { authorId, payoutStatus: 'pending' },
            _sum: { authorNetAmount: true },
          }),
          tx.saleDistribution.aggregate({
            where: { authorId, payoutStatus: 'available' },
            _sum: { authorNetAmount: true },
          }),
        ]),
    );

    return {
      salesCount: totals._count,
      grossTotal: decimalToString(totals._sum.grossAmount),
      commissionTotal: decimalToString(totals._sum.gebookCommissionAmount),
      netTotal: decimalToString(totals._sum.authorNetAmount),
      pendingPayout: decimalToString(pending._sum.authorNetAmount),
      availableBalance: decimalToString(available._sum.authorNetAmount),
    };
  }

  /**
   * Chiffres de la plateforme, tous comptés en base.
   *
   * Ils remplacent les valeurs codées en dur du tableau de bord d'origine
   * (audit §14). Aucune estimation, aucune projection : ce qui est affiché est ce
   * qui existe.
   */
  /**
   * `AdminCommissionsController` est `@Roles('admin')` : platform_admin garanti.
   *
   * `publishedWorks`/`activeAuthors`/`readers`/`pendingPayout` restent des
   * états actuels, jamais scopés par période : « auteurs actifs au 12 mars »
   * n'a pas de sens sans historique de statut, et le dû aux auteurs est une
   * dette présente, pas un événement daté. Seuls les chiffres réellement
   * datés (`paidOrders`, `revenueCollected`, `commissionTotal`,
   * `authorNetTotal`) se recalculent avec `range`.
   */
  async platformStatistics(
    range?: DateRangeQuery,
  ): Promise<PlatformStatisticsResponse> {
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };
    const { from, to } = resolveDateRange(range);

    const [
      publishedWorks,
      activeAuthors,
      paidOrders,
      readers,
      collected,
      distributions,
      pending,
      available,
    ] = await this.prisma.withRlsContext(ctx, (tx) =>
      Promise.all([
        tx.work.count({ where: { status: 'published' } }),
        tx.author.count({ where: { status: 'active' } }),
        tx.payment.count({
          where: { status: 'successful', paidAt: { gte: from, lte: to } },
        }),
        tx.user.count(),
        tx.payment.aggregate({
          where: { status: 'successful', paidAt: { gte: from, lte: to } },
          _sum: { paidAmount: true },
        }),
        // Phase 7 : `cancelled` (remboursement) exclu — une ligne annulée ne
        // doit plus compter dans la commission ou le net encaissés, même
        // pour la période où elle avait été figée à l'origine.
        tx.saleDistribution.aggregate({
          where: {
            calculatedAt: { gte: from, lte: to },
            payoutStatus: { not: 'cancelled' },
          },
          _sum: { gebookCommissionAmount: true, authorNetAmount: true },
        }),
        tx.saleDistribution.aggregate({
          where: { payoutStatus: 'pending' },
          _sum: { authorNetAmount: true },
        }),
        tx.saleDistribution.aggregate({
          where: { payoutStatus: 'available' },
          _sum: { authorNetAmount: true },
        }),
      ]),
    );

    return {
      publishedWorks,
      activeAuthors,
      paidOrders,
      readers,
      revenueCollected: decimalToString(collected._sum.paidAmount),
      commissionTotal: decimalToString(
        distributions._sum.gebookCommissionAmount,
      ),
      authorNetTotal: decimalToString(distributions._sum.authorNetAmount),
      pendingPayout: decimalToString(pending._sum.authorNetAmount),
      availableBalance: decimalToString(available._sum.authorNetAmount),
    };
  }

  /**
   * Chiffres de vente d'UN tenant.
   *
   * Contrairement à `platformStatistics()`, il ne peut pas sommer
   * `Payment.paidAmount` : une commande peut contenir des lignes de plusieurs
   * tenants (`order_items.tenant_id`, brief §17), donc un paiement n'est pas
   * attribuable à un seul tenant. `SaleDistribution` existe précisément à la
   * granularité de la ligne — via sa relation `orderItem.tenantId` — pour ce
   * calcul-là (règle n° 11 : ni recalculée depuis un autre niveau, ni
   * reconstituée en mémoire).
   */
  async tenantStatistics(
    admin: AuthenticatedUser,
    tenant: TenantContext,
    range?: DateRangeQuery,
  ): Promise<TenantStatisticsResponse> {
    const tenantId = assertCanViewTenantFinance(tenant);
    const { from, to } = resolveDateRange(range);

    const [
      publishedWorks,
      activeAuthors,
      distributions,
      pending,
      available,
      counts,
    ] = await this.prisma.withRlsContext(
      buildRlsContext(admin, tenantId),
      (tx) =>
        Promise.all([
          tx.work.count({ where: { tenantId, status: 'published' } }),
          tx.author.count({ where: { tenantId, status: 'active' } }),
          // Phase 7 : `cancelled` (remboursement) exclu — voir le même
          // commentaire dans `platformStatistics()`.
          tx.saleDistribution.aggregate({
            where: {
              orderItem: { tenantId },
              calculatedAt: { gte: from, lte: to },
              payoutStatus: { not: 'cancelled' },
            },
            _sum: {
              grossAmount: true,
              gebookCommissionAmount: true,
              authorNetAmount: true,
            },
            _count: true,
          }),
          tx.saleDistribution.aggregate({
            where: { orderItem: { tenantId }, payoutStatus: 'pending' },
            _sum: { authorNetAmount: true },
          }),
          tx.saleDistribution.aggregate({
            where: { orderItem: { tenantId }, payoutStatus: 'available' },
            _sum: { authorNetAmount: true },
          }),
          // Distinct de `salesCount` (une ligne par `SaleDistribution`) : une
          // commande peut porter plusieurs lignes du même tenant, et un même
          // lecteur peut avoir acheté plusieurs fois — SQL brut pour un vrai
          // COUNT(DISTINCT ...), impossible à exprimer avec `groupBy`/`_count`
          // Prisma sur une relation. Même style paramétré que
          // `revenueTimeseries()` ci-dessous ; le filtre `oi.tenant_id` est
          // redondant avec la RLS (défense en profondeur, cf. Phase 0 §0.3).
          tx.$queryRaw<{ orders_count: number; readers_count: number }[]>`
            SELECT
              COUNT(DISTINCT oi.order_id)::int AS orders_count,
              COUNT(DISTINCT o.user_id)::int AS readers_count
            FROM sale_distributions sd
            JOIN order_items oi ON oi.id = sd.order_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.tenant_id = ${tenantId}
              AND sd.calculated_at >= ${from}
              AND sd.calculated_at <= ${to}
          `,
        ]),
    );

    return {
      publishedWorks,
      activeAuthors,
      salesCount: distributions._count,
      ordersCount: counts[0]?.orders_count ?? 0,
      readersCount: counts[0]?.readers_count ?? 0,
      revenueCollected: decimalToString(distributions._sum.grossAmount),
      commissionTotal: decimalToString(
        distributions._sum.gebookCommissionAmount,
      ),
      authorNetTotal: decimalToString(distributions._sum.authorNetAmount),
      pendingPayout: decimalToString(pending._sum.authorNetAmount),
      availableBalance: decimalToString(available._sum.authorNetAmount),
    };
  }

  /**
   * Encaissé par jour, sur la période demandée (30 derniers jours par défaut).
   *
   * `groupBy` de Prisma ne sait pas grouper par `DATE_TRUNC` : la requête reste
   * SQL brute, mais paramétrée (les bornes s'interpolent comme des paramètres
   * liés, pas du texte concaténé) donc sans risque d'injection. Les jours sans
   * paiement n'apparaissent pas en base ; `fillMissingDays` les complète à
   * zéro pour que le graphe ne saute pas de points.
   */
  async revenueTimeseries(
    range?: DateRangeQuery,
  ): Promise<RevenueTimeseriesPoint[]> {
    const ctx: RlsContext = {
      userId: null,
      tenantId: null,
      isPlatformAdmin: true,
    };
    const { from, to } = resolveDateRange(range);

    const rows = await this.prisma.withRlsContext(
      ctx,
      (tx) =>
        tx.$queryRaw<{ day: Date; total: Prisma.Decimal }[]>`
        SELECT date_trunc('day', "paid_at") AS day, SUM("paid_amount") AS total
        FROM payments
        WHERE status = 'successful'
          AND paid_at >= ${from}
          AND paid_at <= ${to}
        GROUP BY 1
        ORDER BY 1
      `,
    );

    const byDay = new Map(
      rows.map((row) => [toDateKey(row.day), decimalToString(row.total)]),
    );

    return fillMissingDays(byDay, from, to);
  }
}

export interface RevenueTimeseriesPoint {
  date: string;
  revenueCollected: string;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Plafond de points renvoyés : une période personnalisée trop large dégrade
 * le graphe (des centaines de points) avant d'être utile — 366 couvre large
 * (le mois glissant, l'année entière) sans exposer une requête arbitrairement
 * coûteuse. */
const MAX_TIMESERIES_DAYS = 366;

function fillMissingDays(
  byDay: Map<string, string>,
  from: Date,
  to: Date,
): RevenueTimeseriesPoint[] {
  const points: RevenueTimeseriesPoint[] = [];
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );

  for (
    let day = start, count = 0;
    day <= end && count < MAX_TIMESERIES_DAYS;
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000), count += 1
  ) {
    const key = toDateKey(day);
    points.push({ date: key, revenueCollected: byDay.get(key) ?? '0.00' });
  }

  return points;
}

export interface PlatformStatisticsResponse {
  publishedWorks: number;
  activeAuthors: number;
  paidOrders: number;
  readers: number;
  /** Chiffre d'affaires encaissé, somme des paiements réellement confirmés. */
  revenueCollected: string;
  commissionTotal: string;
  authorNetTotal: string;
  pendingPayout: string;
  /** Part disponible pour un reversement, tous auteurs confondus (Phase 7). */
  availableBalance: string;
}

export interface TenantStatisticsResponse {
  publishedWorks: number;
  activeAuthors: number;
  /** Nombre de lignes vendues (une `SaleDistribution` par ligne de commande), pas de commandes. */
  salesCount: number;
  /** Commandes distinctes contenant au moins une ligne de ce tenant, sur la période. */
  ordersCount: number;
  /** Lecteurs distincts ayant acheté au moins une ligne de ce tenant, sur la période. */
  readersCount: number;
  revenueCollected: string;
  commissionTotal: string;
  authorNetTotal: string;
  pendingPayout: string;
  /** Part disponible pour un reversement, pour ce tenant (Phase 7). */
  availableBalance: string;
}

export interface AuthorSaleResponse {
  id: string;
  orderNumber: string;
  workTitle: string;
  formatType: string;
  quantity: number;
  grossAmount: string;
  providerFee: string;
  gebookCommissionAmount: string;
  authorNetAmount: string;
  payoutStatus: string;
  soldAt: string;
}

export interface AuthorRevenueResponse {
  salesCount: number;
  grossTotal: string;
  commissionTotal: string;
  netTotal: string;
  /**
   * Part encore au statut `pending` (Phase 7 : ne s'y trouve plus qu'un très
   * bref instant, une vente devenant `available` dès son figeage — vaut donc
   * `0` en pratique tant qu'aucun mécanisme de reversement réel n'introduit
   * un vrai délai de rétention).
   */
  pendingPayout: string;
  /** Part disponible pour un reversement, aucun n'ayant encore réellement eu lieu. */
  availableBalance: string;
}

/** Une somme sur un ensemble vide vaut `null` en SQL, pas zéro. */
function decimalToString(value: Prisma.Decimal | null): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}
