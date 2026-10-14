import { maskPhone, normalizePhoneDigits } from './phone';

describe('normalizePhoneDigits', () => {
  it.each([
    ['242061234567', '242061234567'],
    ['+242 06 123 45 67', '242061234567'],
    ['00242-06-123-45-67', '242061234567'],
    ['(242) 06.123.4567', '242061234567'],
  ])('normalise %s', (input, expected) => {
    expect(normalizePhoneDigits(input)).toBe(expected);
  });

  it('ne devine pas un indicatif absent', () => {
    expect(normalizePhoneDigits('061234567')).toBe('061234567');
  });
});

describe('maskPhone', () => {
  it('garde l’indicatif et les trois derniers chiffres', () => {
    expect(maskPhone('242061234567')).toBe('242******567');
  });

  it('ne fuit jamais un numéro court', () => {
    expect(maskPhone('12345')).toBe('*****');
    expect(maskPhone(undefined)).toBe('[absent]');
  });
});
