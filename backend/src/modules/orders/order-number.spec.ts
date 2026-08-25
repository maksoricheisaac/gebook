import { generateOrderNumber } from './order-number';

describe('generateOrderNumber', () => {
  it('produit un numéro au format GB-AAAAMMJJ-XXXXXX', () => {
    expect(generateOrderNumber()).toMatch(/^GB-\d{8}-[A-Z0-9]{6}$/);
  });

  it('ne produit pas deux numéros identiques sur un grand échantillon', () => {
    const numbers = new Set(
      Array.from({ length: 1000 }, () => generateOrderNumber()),
    );
    expect(numbers.size).toBe(1000);
  });
});
