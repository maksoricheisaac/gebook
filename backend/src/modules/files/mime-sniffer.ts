/**
 * Détection du type réel d'un fichier par ses premiers octets, jamais par
 * l'en-tête `Content-Type` du client (audit §34 — "type MIME réel vérifié, pas
 * seulement l'extension"). Un `.jpg` renommé en `.pdf` ne trompe pas cette
 * vérification, alors qu'il tromperait n'importe quel contrôle sur l'extension.
 *
 * Volontairement limité aux formats que GeBook accepte réellement : ni un
 * détecteur MIME général, ni une dépendance externe pour huit signatures fixes.
 */

export type SniffedMimeType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function sniffMimeType(buffer: Buffer): SniffedMimeType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.toString('ascii', 0, 4) === '%PDF') {
    return 'application/pdf';
  }

  return null;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}
