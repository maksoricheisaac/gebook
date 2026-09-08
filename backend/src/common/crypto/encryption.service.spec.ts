import type { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

const KEY_HEX = 'a'.repeat(64);

function service(key: string = KEY_HEX): EncryptionService {
  const config = {
    getOrThrow: () => key,
  } as unknown as ConfigService;
  return new EncryptionService(config);
}

describe('EncryptionService', () => {
  it('déchiffre exactement ce qui a été chiffré', () => {
    const svc = service();
    const ciphertext = svc.encrypt('CINETPAY_API_KEY=super-secret');

    expect(ciphertext).not.toContain('super-secret');
    expect(svc.decrypt(ciphertext)).toBe('CINETPAY_API_KEY=super-secret');
  });

  it('produit un texte chiffré différent à chaque appel (IV aléatoire)', () => {
    const svc = service();
    const a = svc.encrypt('même valeur');
    const b = svc.encrypt('même valeur');

    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('même valeur');
    expect(svc.decrypt(b)).toBe('même valeur');
  });

  it('accepte une clé encodée en base64 (32 octets)', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const svc = service(key);

    expect(svc.decrypt(svc.encrypt('valeur'))).toBe('valeur');
  });

  it('refuse une clé qui ne représente pas 32 octets', () => {
    const svc = service('trop-court');
    expect(() => svc.encrypt('x')).toThrow();
  });

  it('détecte un texte chiffré altéré (authTag invalide)', () => {
    const svc = service();
    const ciphertext = svc.encrypt('valeur sensible');
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => svc.decrypt(tampered.toString('base64'))).toThrow();
  });
});
