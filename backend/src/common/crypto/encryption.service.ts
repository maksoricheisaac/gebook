import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Chiffrement au repos des identifiants de prestataire de paiement stockés
 * en base (`payment_provider_credentials`) — premier usage de chiffrement
 * applicatif dans ce code, sans précédent à réutiliser.
 *
 * AES-256-GCM : IV aléatoire par valeur (jamais réutilisé, condition de
 * sécurité du mode GCM), `authTag` conservé à côté du texte chiffré pour
 * détecter toute altération au déchiffrement plutôt que de renvoyer un
 * texte corrompu en silence. La clé elle-même reste hors base — voir
 * `CREDENTIALS_ENCRYPTION_KEY` (`environment.ts`), même traitement que
 * `PAYMENT_WEBHOOK_SECRET` : jamais journalisée, jamais renvoyée par une
 * route Superadmin.
 */
@Injectable()
export class EncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    const raw = this.config.getOrThrow<string>('CREDENTIALS_ENCRYPTION_KEY');
    // Hex (64 caractères) ou base64 (44 caractères, avec ou sans `=` final) —
    // les deux encodages usuels pour transmettre 32 octets dans une variable
    // d'environnement texte. `validateEnvironment()` garantit déjà l'une des
    // deux formes avant que ce code ne s'exécute.
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');

    if (key.length !== KEY_LENGTH) {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY doit représenter exactement 32 octets (hex 64 caractères ou base64).',
      );
    }

    return key;
  }
}
