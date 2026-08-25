import { Prisma } from '../../generated/prisma/client';
import { fromMinorUnits, toMinorUnits } from './money';

describe('conversion des montants', () => {
  it('convertit un montant décimal en entier d’unités mineures', () => {
    expect(toMinorUnits(new Prisma.Decimal('15000.00'))).toBe(1500000);
    expect(toMinorUnits(new Prisma.Decimal('0.00'))).toBe(0);
    expect(toMinorUnits(new Prisma.Decimal('12.34'))).toBe(1234);
  });

  it('revient au montant d’origine sans perte', () => {
    const amount = new Prisma.Decimal('7500.50');

    expect(fromMinorUnits(toMinorUnits(amount)).equals(amount)).toBe(true);
  });

  it('ne réintroduit pas d’erreur de flottant', () => {
    // 0.1 + 0.2 en flottant vaut 0.30000000000000004 : c'est précisément ce que
    // la règle métier n° 12 interdit sur un montant.
    const total = fromMinorUnits(toMinorUnits(new Prisma.Decimal('0.10'))).add(
      fromMinorUnits(toMinorUnits(new Prisma.Decimal('0.20'))),
    );

    expect(total.toFixed(2)).toBe('0.30');
  });

  it('rejette un écart d’un centime lors de la comparaison de montants', () => {
    // Le contrôle de montant du webhook (règle n° 10) repose sur cette égalité.
    expect(toMinorUnits(new Prisma.Decimal('15000.00'))).not.toBe(
      toMinorUnits(new Prisma.Decimal('14999.99')),
    );
  });
});
