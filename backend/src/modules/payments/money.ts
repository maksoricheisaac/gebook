import { Prisma } from '../../generated/prisma/client';

/**
 * Les prestataires de paiement échangent des entiers, jamais des décimaux : un
 * flottant qui traverse deux systèmes finit toujours par perdre un centime
 * (règle métier n° 12). GeBook stocke des `DECIMAL(12,2)` ; l'unité mineure est
 * donc le centième de l'unité monétaire.
 *
 * Le franc CFA n'a pas de subdivision en pratique, mais la base autorise deux
 * décimales et d'autres devises pourraient suivre : la conversion s'appuie sur le
 * type de la colonne, pas sur une hypothèse propre au XAF.
 */
const MINOR_UNIT_FACTOR = 100;

export function toMinorUnits(amount: Prisma.Decimal): number {
  return amount.mul(MINOR_UNIT_FACTOR).toDecimalPlaces(0).toNumber();
}

export function fromMinorUnits(amountMinor: number): Prisma.Decimal {
  return new Prisma.Decimal(amountMinor).div(MINOR_UNIT_FACTOR);
}
