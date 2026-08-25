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
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf'
  | 'application/epub+zip'
  | 'audio/mpeg'
  | 'audio/mp4';

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

  // L'EPUB est une archive ZIP : la signature ne suffit pas à le distinguer d'un
  // ZIP quelconque, mais elle exclut déjà tout fichier qui n'en est pas un —
  // c'est la garantie qui compte ici.
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return 'application/epub+zip';
  }

  if (
    buffer.toString('ascii', 0, 3) === 'ID3' ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }

  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }

  return null;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}
