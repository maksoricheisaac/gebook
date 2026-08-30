import { Prisma } from '../../generated/prisma/client';
import {
  CalculationBase,
  CommissionType,
  TenantType,
} from '../../generated/prisma/enums';
import {
  allocateProviderFee,
  computeDistribution,
  selectRule,
  type ApplicableRule,
} from './commission';

/**
 * Vérification de la formule de répartition.
 *
 * Chaque montant attendu ci-dessous est calculé à la main depuis la formule
 * écrite en tête de `commission.ts`, jamais relevé sur une exécution du code :
 * un test qui recopie le résultat observé ne prouve rien. C'est l'exigence de
 * l'audit sur le risque R-03, le seul endroit du projet où une erreur se compte
 * directement en francs.
 */

const money = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

function percentageRule(
  value: string,
  base: CalculationBase = CalculationBase.after_provider_fee,
): ApplicableRule {
  return {
    id: 'regle-pourcentage',
    commissionType: CommissionType.percentage,
    commissionValue: money(value),
    calculationBase: base,
  };
}

function fixedRule(value: string): ApplicableRule {
  return {
    id: 'regle-fixe',
    commissionType: CommissionType.fixed,
    commissionValue: money(value),
    calculationBase: CalculationBase.after_provider_fee,
  };
}

describe('Répartition d’une vente', () => {
  describe('Les deux bases de calcul (règle n° 16)', () => {
    // Mêmes entrées, seule la base change : c'est exactement ce que la règle
    // n° 16 exige de pouvoir configurer.
    const input = {
      grossAmount: money('10000.00'),
      providerFee: money('250.00'),
      quantity: 1,
    };

    it('prélève 10 % du net après frais du prestataire', () => {
      // net = 10 000 − 250 = 9 750 ; commission = 9 750 × 10 % = 975
      const result = computeDistribution({
        ...input,
        rule: percentageRule('10'),
      });

      expect(result.netAfterProviderFee.toFixed(2)).toBe('9750.00');
      expect(result.gebookCommissionAmount.toFixed(2)).toBe('975.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('8775.00');
      expect(result.gebookCommissionRate?.toString()).toBe('10');
    });

    it('prélève 10 % du montant brut', () => {
      // commission = 10 000 × 10 % = 1 000 ; auteur = 9 750 − 1 000 = 8 750
      const result = computeDistribution({
        ...input,
        rule: percentageRule('10', CalculationBase.gross_amount),
      });

      expect(result.netAfterProviderFee.toFixed(2)).toBe('9750.00');
      expect(result.gebookCommissionAmount.toFixed(2)).toBe('1000.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('8750.00');
    });

    it('laisse toujours brut = frais + commission + part auteur', () => {
      // L'invariant comptable : rien ne se perd, rien ne se crée.
      const result = computeDistribution({
        ...input,
        rule: percentageRule('10'),
      });

      const recomposed = result.providerFee
        .add(result.gebookCommissionAmount)
        .add(result.authorNetAmount);

      expect(recomposed.toFixed(2)).toBe(result.grossAmount.toFixed(2));
    });
  });

  describe('Commission fixe', () => {
    it('se prélève par exemplaire vendu', () => {
      // 3 exemplaires × 500 = 1 500 ; auteur = 30 000 − 1 500 = 28 500
      const result = computeDistribution({
        grossAmount: money('30000.00'),
        providerFee: money('0.00'),
        quantity: 3,
        rule: fixedRule('500'),
      });

      expect(result.gebookCommissionAmount.toFixed(2)).toBe('1500.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('28500.00');
    });

    it('n’expose aucun taux, puisqu’il n’y en a pas', () => {
      const result = computeDistribution({
        grossAmount: money('30000.00'),
        providerFee: money('0.00'),
        quantity: 1,
        rule: fixedRule('500'),
      });

      expect(result.gebookCommissionRate).toBeNull();
    });

    it('est plafonnée au net : l’auteur ne doit jamais d’argent', () => {
      // Commission fixe de 5 000 sur une vente de 2 000 : sans plafond, la part
      // auteur vaudrait −3 000, ce que la contrainte CHECK refuse.
      const result = computeDistribution({
        grossAmount: money('2000.00'),
        providerFee: money('0.00'),
        quantity: 1,
        rule: fixedRule('5000'),
      });

      expect(result.gebookCommissionAmount.toFixed(2)).toBe('2000.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('0.00');
    });
  });

  describe('Cas limites', () => {
    it('sans règle applicable, ne prélève rien', () => {
      const result = computeDistribution({
        grossAmount: money('10000.00'),
        providerFee: money('250.00'),
        quantity: 1,
        rule: null,
      });

      expect(result.gebookCommissionAmount.toFixed(2)).toBe('0.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('9750.00');
      expect(result.commissionRuleId).toBeNull();
    });

    it('ne rend jamais un net négatif quand les frais dépassent la vente', () => {
      const result = computeDistribution({
        grossAmount: money('100.00'),
        providerFee: money('500.00'),
        quantity: 1,
        rule: percentageRule('10'),
      });

      expect(result.netAfterProviderFee.toFixed(2)).toBe('0.00');
      expect(result.gebookCommissionAmount.toFixed(2)).toBe('0.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('0.00');
    });

    it('arrondit la commission au centime supérieur à la moitié', () => {
      // 100 × 12,345 % = 12,345 → 12,35 (arrondi commercial)
      const result = computeDistribution({
        grossAmount: money('100.00'),
        providerFee: money('0.00'),
        quantity: 1,
        rule: percentageRule('12.345', CalculationBase.gross_amount),
      });

      expect(result.gebookCommissionAmount.toFixed(2)).toBe('12.35');
      expect(result.authorNetAmount.toFixed(2)).toBe('87.65');
    });

    it('accepte une commission de 100 % sans rien laisser de négatif', () => {
      const result = computeDistribution({
        grossAmount: money('5000.00'),
        providerFee: money('0.00'),
        quantity: 1,
        rule: percentageRule('100'),
      });

      expect(result.gebookCommissionAmount.toFixed(2)).toBe('5000.00');
      expect(result.authorNetAmount.toFixed(2)).toBe('0.00');
    });
  });

  describe('Répartition des frais du prestataire', () => {
    it('impute les frais au prorata du montant de chaque ligne', () => {
      // 300 de frais sur 15 000 : 10 000 → 200, 5 000 → 100
      const shares = allocateProviderFee(
        [money('10000.00'), money('5000.00')],
        money('300.00'),
      );

      expect(shares.map((share) => share.toFixed(2))).toEqual([
        '200.00',
        '100.00',
      ]);
    });

    it('fait absorber l’écart d’arrondi par la dernière ligne', () => {
      // 100 de frais sur trois lignes quasi égales : 33,33 + 33,33 + 33,34 = 100
      const shares = allocateProviderFee(
        [money('3333.33'), money('3333.33'), money('3333.34')],
        money('100.00'),
      );

      expect(shares.map((share) => share.toFixed(2))).toEqual([
        '33.33',
        '33.33',
        '33.34',
      ]);

      const total = shares.reduce(
        (sum, share) => sum.add(share),
        new Prisma.Decimal(0),
      );
      // Le point qui compte : la somme des parts égale exactement les frais.
      expect(total.toFixed(2)).toBe('100.00');
    });

    it('n’impute rien quand le prestataire ne facture pas de frais', () => {
      const shares = allocateProviderFee(
        [money('10000.00'), money('5000.00')],
        money('0.00'),
      );

      expect(shares.map((share) => share.toFixed(2))).toEqual(['0.00', '0.00']);
    });

    it('ne divise pas par zéro sur une commande entièrement remisée', () => {
      const shares = allocateProviderFee(
        [money('0.00'), money('0.00')],
        money('50.00'),
      );

      expect(shares.map((share) => share.toFixed(2))).toEqual(['0.00', '0.00']);
    });
  });

  describe('Choix de la règle applicable', () => {
    const TENANT_A = 'tenant-a';
    const TENANT_B = 'tenant-b';

    const generale = {
      id: 'generale',
      authorId: null,
      tenantId: null,
      tenantType: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    };
    const propre = {
      id: 'propre-auteur',
      authorId: 'auteur-1',
      tenantId: null,
      tenantType: null,
      effectiveFrom: new Date('2026-02-01T00:00:00Z'),
    };
    const vente = new Date('2026-06-01T00:00:00Z');

    const contexte = (
      overrides: Partial<{
        authorId: string;
        tenantId: string | null;
        tenantType: TenantType | null;
      }> = {},
    ) => ({
      authorId: 'auteur-1',
      tenantId: null,
      tenantType: null,
      ...overrides,
    });

    it('retient la règle propre à l’auteur plutôt que la générale', () => {
      expect(selectRule([generale, propre], contexte(), vente)?.id).toBe(
        'propre-auteur',
      );
    });

    it('retient la règle générale pour un auteur sans règle propre', () => {
      expect(
        selectRule(
          [generale, propre],
          contexte({ authorId: 'auteur-2' }),
          vente,
        )?.id,
      ).toBe('generale');
    });

    it('préfère une règle propre même plus ancienne que la générale', () => {
      // La portée prime sur la date : un taux négocié ne doit pas sauter parce
      // qu'une règle générale a été publiée après lui.
      const generaleRecente = {
        id: 'generale-recente',
        authorId: null,
        tenantId: null,
        tenantType: null,
        effectiveFrom: new Date('2026-05-01T00:00:00Z'),
      };

      expect(selectRule([generaleRecente, propre], contexte(), vente)?.id).toBe(
        'propre-auteur',
      );
    });

    it('retient la plus récente à portée égale', () => {
      const ancienne = {
        id: 'ancienne',
        authorId: null,
        tenantId: null,
        tenantType: null,
        effectiveFrom: new Date('2025-01-01T00:00:00Z'),
      };

      expect(selectRule([ancienne, generale], contexte(), vente)?.id).toBe(
        'generale',
      );
    });

    it('ignore une règle qui n’est pas encore entrée en vigueur', () => {
      const future = {
        id: 'future',
        authorId: 'auteur-1',
        tenantId: null,
        tenantType: null,
        effectiveFrom: new Date('2027-01-01T00:00:00Z'),
      };

      expect(selectRule([generale, future], contexte(), vente)?.id).toBe(
        'generale',
      );
    });

    it('ne retourne aucune règle quand rien ne s’applique', () => {
      expect(selectRule([], contexte(), vente)).toBeNull();
    });

    it('retient la règle propre au tenant plutôt que la générale', () => {
      const parTenant = {
        id: 'tenant-a-specifique',
        authorId: null,
        tenantId: TENANT_A,
        tenantType: null,
        effectiveFrom: new Date('2026-01-15T00:00:00Z'),
      };

      expect(
        selectRule(
          [generale, parTenant],
          contexte({ tenantId: TENANT_A }),
          vente,
        )?.id,
      ).toBe('tenant-a-specifique');
    });

    it('ignore la règle d’un autre tenant', () => {
      const parTenantB = {
        id: 'tenant-b-specifique',
        authorId: null,
        tenantId: TENANT_B,
        tenantType: null,
        effectiveFrom: new Date('2026-01-15T00:00:00Z'),
      };

      expect(
        selectRule(
          [generale, parTenantB],
          contexte({ tenantId: TENANT_A }),
          vente,
        )?.id,
      ).toBe('generale');
    });

    it('retient la règle par type de tenant plutôt que la générale', () => {
      const parType = {
        id: 'type-maison-edition',
        authorId: null,
        tenantId: null,
        tenantType: TenantType.publishing_house,
        effectiveFrom: new Date('2026-01-15T00:00:00Z'),
      };

      expect(
        selectRule(
          [generale, parType],
          contexte({ tenantType: TenantType.publishing_house }),
          vente,
        )?.id,
      ).toBe('type-maison-edition');
    });

    it('respecte la chaîne complète : auteur > tenant > type de tenant > globale', () => {
      const parType = {
        id: 'type-maison-edition',
        authorId: null,
        tenantId: null,
        tenantType: TenantType.publishing_house,
        effectiveFrom: new Date('2026-01-15T00:00:00Z'),
      };
      const parTenant = {
        id: 'tenant-a-specifique',
        authorId: null,
        tenantId: TENANT_A,
        tenantType: null,
        effectiveFrom: new Date('2026-01-20T00:00:00Z'),
      };
      const toutes = [generale, parType, parTenant, propre];
      const ctx = contexte({
        tenantId: TENANT_A,
        tenantType: TenantType.publishing_house,
      });

      // L'auteur a une règle propre : elle gagne malgré les règles tenant/type.
      expect(selectRule(toutes, ctx, vente)?.id).toBe('propre-auteur');
      // Sans règle auteur, la règle tenant gagne sur le type et le global.
      expect(selectRule([generale, parType, parTenant], ctx, vente)?.id).toBe(
        'tenant-a-specifique',
      );
      // Sans règle tenant, la règle de type gagne sur le global.
      expect(selectRule([generale, parType], ctx, vente)?.id).toBe(
        'type-maison-edition',
      );
    });
  });
});
