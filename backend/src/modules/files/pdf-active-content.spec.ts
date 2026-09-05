import { findDangerousPdfContent } from './pdf-active-content';

describe('findDangerousPdfContent', () => {
  it('ne signale rien pour un PDF sans contenu actif', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n');

    expect(findDangerousPdfContent(pdf)).toBeNull();
  });

  it('détecte du JavaScript embarqué', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /S /JavaScript /JS (app.alert(1)) >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBe('/JavaScript');
  });

  it('détecte une action Launch', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /S /Launch /F (cmd.exe) /Win << /F (cmd.exe) >> >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBe('/Launch');
  });

  it('détecte une pièce jointe embarquée', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /Type /Filespec /EF << /F 5 0 R >> /EmbeddedFile true >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBe('/EmbeddedFile');
  });

  it('reste correct sur des octets non-ASCII (encodage latin1)', () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x01]);

    expect(findDangerousPdfContent(pdf)).toBeNull();
  });

  it('ne signale plus un simple /OpenAction bénin (aller à une page)', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /Type /Catalog /OpenAction << /S /GoTo /D [0 /Fit] >> >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBeNull();
  });

  it('ne signale plus un simple /AA bénin (mise en forme de champ)', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /Type /Annot /FT /Tx /AA << /F 5 0 R >> >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBeNull();
  });

  it('détecte toujours un /OpenAction dont la charge est du JavaScript', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n',
    );

    expect(findDangerousPdfContent(pdf)).toBe('/JavaScript');
  });
});
