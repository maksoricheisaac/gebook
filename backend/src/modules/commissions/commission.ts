import { Prisma } from '../../generated/prisma/client';
import {
  CalculationBase,
  CommissionType,
  TenantType,
} from '../../generated/prisma/enums';

/**
 * Calcul de la répartition d'une vente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORMULE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Elle n'était écrite nulle part dans le projet d'origine — c'est le manque que
 * l'audit qualifie de risque critique R-03, sur du code qui touche à de l'argent.
 * La voici, pour une ligne de commande :
 *
 *   montantBrut        = order_items.line_total          (instantané figé, règle 6)
 *   fraisPrestataire   = part de la ligne dans les frais du paiement
 *   netApresFrais      = montantBrut − fraisPrestataire
 *
 *   base               = selon `commission_rules.calculation_base` (règle 16)
 *                          gross_amount       → montantBrut
 *                          after_provider_fee → netApresFrais
 *
 *   commission         = pourcentage : base × valeur / 100
 *                        fixe        : valeur × quantité   (par exemplaire vendu)
 *
 *   commission         = min(commission, netApresFrais)         ← plafond
 *   partAuteur         = netApresFrais − commission
 *
 * Trois décisions valent d'être explicites :
 *
 * 1. **La commission fixe est prélevée par exemplaire**, pas par ligne. Elle suit
 *    donc le volume vendu, comme le fait un pourcentage.
 * 2. **La commission est plafonnée au net.** Sans ce plafond, une commission fixe
 *    supérieure au prix rendrait la part auteur négative — ce que la contrainte
 *    `chk_sale_distribution_amounts` refuse, et qui reviendrait à faire payer
 *    l'auteur pour avoir vendu.
 * 3. **Sans règle applicable, la commission est nulle** et l'auteur touche le net.
 *    Prélever un montant sans règle écrite serait indéfendable ; refuser la vente
 *    après paiement le serait encore plus.
 *
 * Tous les calculs passent par `Prisma.Decimal` : jamais un flottant sur un
 * montant (règle 12). Les montants sont arrondis à deux décimales, les taux
 * conservés tels quels.
 *
 * Ce fichier ne contient que des fonctions pures, sans accès à la base : c'est ce
 * qui rend la formule vérifiable ligne à ligne, indépendamment de Prisma.
 */

const MONEY_SCALE = 2;

/** Sous-ensemble d'une règle nécessaire au calcul — rien de plus. */
export interface ApplicableRule {
  id: string;
  commissionType: CommissionType;
  commissionValue: Prisma.Decimal;
  calculationBase: CalculationBase;
}

export interface DistributionInput {
  /** `order_items.line_total`, instantané figé à la commande. */
  grossAmount: Prisma.Decimal;
  /** Part des frais du prestataire imputée à cette ligne. */
  providerFee: Prisma.Decimal;
  quantity: number;
  /** `null` lorsqu'aucune règle n'est applicable à cette vente. */
  rule: ApplicableRule | null;
}

export interface Distribution {
  grossAmount: Prisma.Decimal;
  providerFee: Prisma.Decimal;
  netAfterProviderFee: Prisma.Decimal;
  /** Taux appliqué, renseigné pour un pourcentage seulement. */
  gebookCommissionRate: Prisma.Decimal | null;
  gebookCommissionAmount: Prisma.Decimal;
  authorNetAmount: Prisma.Decimal;
  commissionRuleId: string | null;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE);
}

export function computeDistribution(input: DistributionInput): Distribution {
  const grossAmount = money(input.grossAmount);
  const providerFee = money(input.providerFee);

  // Le net ne peut pas être négatif : des frais supérieurs au montant de la ligne
  // relèvent d'une anomalie de configuration, pas d'une dette de l'auteur.
  const netAfterProviderFee = money(
    Prisma.Decimal.max(grossAmount.sub(providerFee), 0),
  );

  if (!input.rule) {
    return {
      grossAmount,
      providerFee,
      netAfterProviderFee,
      gebookCommissionRate: null,
      gebookCommissionAmount: new Prisma.Decimal(0),
      authorNetAmount: netAfterProviderFee,
      commissionRuleId: null,
    };
  }

  const base =
    input.rule.calculationBase === CalculationBase.gross_amount
      ? grossAmount
      : netAfterProviderFee;

  const raw =
    input.rule.commissionType === CommissionType.percentage
      ? base.mul(input.rule.commissionValue).div(100)
      : input.rule.commissionValue.mul(input.quantity);

  const gebookCommissionAmount = money(
    Prisma.Decimal.min(money(raw), netAfterProviderFee),
  );

  return {
    grossAmount,
    providerFee,
    netAfterProviderFee,
    gebookCommissionRate:
      input.rule.commissionType === CommissionType.percentage
        ? input.rule.commissionValue
        : null,
    gebookCommissionAmount,
    authorNetAmount: money(netAfterProviderFee.sub(gebookCommissionAmount)),
    commissionRuleId: input.rule.id,
  };
}

/**
 * Répartit les frais du prestataire entre les lignes d'une commande.
 *
 * Le prestataire facture une fois pour la commande entière, alors que la
 * répartition se fige ligne par ligne : il faut donc imputer ces frais au prorata
 * du montant de chaque ligne.
 *
 * L'arrondi de chaque part crée un écart de quelques centimes avec le total réel.
 * La dernière ligne absorbe cet écart, ce qui garantit que la somme des parts
 * égale exactement les frais facturés — sans quoi la comptabilité ne tomberait
 * jamais juste.
 */
export function allocateProviderFee(
  lineTotals: Prisma.Decimal[],
  totalProviderFee: Prisma.Decimal,
): Prisma.Decimal[] {
  const fee = money(totalProviderFee);
  const total = lineTotals.reduce(
    (sum, amount) => sum.add(amount),
    new Prisma.Decimal(0),
  );

  if (lineTotals.length === 0 || fee.isZero() || total.isZero()) {
    return lineTotals.map(() => new Prisma.Decimal(0));
  }

  const shares = lineTotals.map((amount) => money(amount.mul(fee).div(total)));
  const allocated = shares
    .slice(0, -1)
    .reduce((sum, share) => sum.add(share), new Prisma.Decimal(0));

  shares[shares.length - 1] = money(fee.sub(allocated));

  return shares;
}

/** Ce qu'il faut connaître de la vente pour choisir la règle applicable. */
export interface RuleSelectionContext {
  authorId: string;
  /** `null` quand la ligne n'a pas de tenant vendeur identifiable (ne devrait pas arriver en pratique — chaque `OrderItem` porte un `tenantId`). */
  tenantId: string | null;
  tenantType: TenantType | null;
}

/**
 * Choisit la règle applicable à une vente, parmi celles en vigueur à sa date.
 *
 * Portée, de la plus spécifique à la plus générale :
 *
 *   1. propre à l'auteur       (existant — négocier un taux sans toucher au reste)
 *   2. propre au tenant        (mission plateforme de paiement, §12-15)
 *   3. par type de tenant      (ex. « maison d'édition » vs « auteur indépendant »)
 *   4. globale GeBook
 *
 * Le niveau 1 n'est pas nommé dans la chaîne du brief (« tenant-spécifique >
 * type de tenant > globale »), mais c'est le niveau déjà existant et testé de
 * ce moteur — le préserver au sommet, plutôt que de le supprimer, est ce qui
 * permet de continuer à négocier un taux avec un auteur précis sans changer
 * le comportement du reste de son tenant. À portée égale, la règle la plus
 * récemment entrée en vigueur gagne (inchangé).
 */
export function selectRule<
  T extends {
    id: string;
    authorId: string | null;
    tenantId: string | null;
    tenantType: TenantType | null;
    effectiveFrom: Date;
  },
>(rules: T[], context: RuleSelectionContext, soldAt: Date): T | null {
  const inEffect = rules.filter((rule) => rule.effectiveFrom <= soldAt);

  const mostRecent = (candidates: T[]): T | null =>
    candidates.length === 0
      ? null
      : candidates.reduce((latest, rule) =>
          rule.effectiveFrom > latest.effectiveFrom ? rule : latest,
        );

  const authorSpecific = inEffect.filter(
    (rule) => rule.authorId === context.authorId,
  );
  if (authorSpecific.length > 0) {
    return mostRecent(authorSpecific);
  }

  if (context.tenantId !== null) {
    const tenantSpecific = inEffect.filter(
      (rule) => rule.authorId === null && rule.tenantId === context.tenantId,
    );
    if (tenantSpecific.length > 0) {
      return mostRecent(tenantSpecific);
    }
  }

  if (context.tenantType !== null) {
    const byTenantType = inEffect.filter(
      (rule) =>
        rule.authorId === null &&
        rule.tenantId === null &&
        rule.tenantType === context.tenantType,
    );
    if (byTenantType.length > 0) {
      return mostRecent(byTenantType);
    }
  }

  const global = inEffect.filter(
    (rule) =>
      rule.authorId === null &&
      rule.tenantId === null &&
      rule.tenantType === null,
  );
  return mostRecent(global);
}
