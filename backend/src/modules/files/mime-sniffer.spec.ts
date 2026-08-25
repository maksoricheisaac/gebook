import { sniffMimeType } from './mime-sniffer';

describe('sniffMimeType', () => {
  it('détecte un JPEG à sa signature', () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
  });

  it('détecte un PNG à sa signature', () => {
    expect(
      sniffMimeType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
  });

  it('détecte un WebP à sa signature RIFF/WEBP', () => {
    const buffer = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(sniffMimeType(buffer)).toBe('image/webp');
  });

  it('détecte un PDF à sa signature %PDF', () => {
    expect(sniffMimeType(Buffer.from('%PDF-1.4\n...'))).toBe('application/pdf');
  });

  it('détecte une archive ZIP (EPUB) à sa signature', () => {
    expect(sniffMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(
      'application/epub+zip',
    );
  });

  it('détecte un MP3 par son en-tête ID3', () => {
    expect(sniffMimeType(Buffer.from('ID3\x03\x00\x00\x00'))).toBe(
      'audio/mpeg',
    );
  });

  it('détecte un MP4/M4A à sa boîte ftyp', () => {
    const buffer = Buffer.concat([
      Buffer.from([0, 0, 0, 0x20]),
      Buffer.from('ftypM4A '),
    ]);
    expect(sniffMimeType(buffer)).toBe('audio/mp4');
  });

  it('ne reconnaît pas un fichier texte quelconque', () => {
    expect(
      sniffMimeType(Buffer.from('ceci n’est pas un fichier connu')),
    ).toBeNull();
  });

  it('ne se laisse pas tromper par une extension : seul le contenu compte', () => {
    // Un fichier texte renommé en .pdf n'a toujours pas la signature %PDF.
    const disguised = Buffer.from('contenu texte quelconque');
    expect(sniffMimeType(disguised)).not.toBe('application/pdf');
  });
});
