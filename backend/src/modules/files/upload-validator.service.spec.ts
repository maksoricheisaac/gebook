import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormatType } from '../../generated/prisma/enums';
import { UploadValidatorService } from './upload-validator.service';
import { VirusScanUnavailableError } from './virus-scan.service';

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PDF_BYTES = Buffer.from('%PDF-1.4\ncontenu de test\n');
const DANGEROUS_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n<< /S /JavaScript /JS (app.alert(1)) >>\n',
);

function multerFile(buffer: Buffer, size = buffer.length): Express.Multer.File {
  return { buffer, size } as Express.Multer.File;
}

function prismaWithMaxSizeMb(mb: number | null): PrismaService {
  return {
    setting: {
      findUnique: () =>
        Promise.resolve(
          mb === null
            ? null
            : { settingKey: 'max_pdf_size_mb', settingValue: String(mb) },
        ),
    },
  } as unknown as PrismaService;
}

function cleanScanner() {
  return {
    scan: jest.fn().mockResolvedValue({ clean: true, signature: null }),
  };
}

function infectedScanner() {
  return {
    scan: jest
      .fn()
      .mockResolvedValue({ clean: false, signature: 'Test.Signature' }),
  };
}

function unavailableScanner() {
  return {
    scan: jest
      .fn()
      .mockRejectedValue(new VirusScanUnavailableError('indisponible')),
  };
}

describe('UploadValidatorService', () => {
  describe('validateImage', () => {
    it('accepte une image JPEG propre', async () => {
      const scanner = cleanScanner();
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(null),
        scanner as never,
      );

      const mime = await service.validateImage(multerFile(JPEG_BYTES));

      expect(mime).toBe('image/jpeg');
      expect(scanner.scan).toHaveBeenCalledWith(JPEG_BYTES);
    });

    it('refuse un type de fichier non reconnu', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(null),
        cleanScanner() as never,
      );

      await expect(
        service.validateImage(multerFile(Buffer.from('pas une image'))),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse une image trop volumineuse avant même de la scanner', async () => {
      const scanner = cleanScanner();
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(null),
        scanner as never,
      );

      await expect(
        service.validateImage(multerFile(JPEG_BYTES, 6 * 1024 * 1024)),
      ).rejects.toThrow(BadRequestException);
      expect(scanner.scan).not.toHaveBeenCalled();
    });

    it('refuse une image détectée infectée par le scanner', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(null),
        infectedScanner() as never,
      );

      await expect(
        service.validateImage(multerFile(JPEG_BYTES)),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse (503) quand le scanner est indisponible plutôt que de laisser passer le fichier', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(null),
        unavailableScanner() as never,
      );

      await expect(
        service.validateImage(multerFile(JPEG_BYTES)),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('validateWorkFile', () => {
    it('accepte un PDF propre et sans contenu actif', async () => {
      const scanner = cleanScanner();
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(100),
        scanner as never,
      );

      const mime = await service.validateWorkFile(
        multerFile(PDF_BYTES),
        FormatType.pdf,
      );

      expect(mime).toBe('application/pdf');
      expect(scanner.scan).toHaveBeenCalledWith(PDF_BYTES);
    });

    it('refuse un PDF contenant du JavaScript embarqué, sans même appeler le scanner', async () => {
      const scanner = cleanScanner();
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(100),
        scanner as never,
      );

      await expect(
        service.validateWorkFile(
          multerFile(DANGEROUS_PDF_BYTES),
          FormatType.pdf,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(scanner.scan).not.toHaveBeenCalled();
    });

    it('refuse un format sans livraison numérique (paper)', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(100),
        cleanScanner() as never,
      );

      await expect(
        service.validateWorkFile(multerFile(PDF_BYTES), FormatType.paper),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse un contenu qui ne correspond pas au format annoncé', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(100),
        cleanScanner() as never,
      );

      await expect(
        service.validateWorkFile(multerFile(JPEG_BYTES), FormatType.pdf),
      ).rejects.toThrow(BadRequestException);
    });

    it('applique le plafond configuré en base (settings.max_pdf_size_mb)', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(1),
        cleanScanner() as never,
      );

      await expect(
        service.validateWorkFile(
          multerFile(PDF_BYTES, 2 * 1024 * 1024),
          FormatType.pdf,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse un ouvrage détecté infecté par le scanner', async () => {
      const service = new UploadValidatorService(
        prismaWithMaxSizeMb(100),
        infectedScanner() as never,
      );

      await expect(
        service.validateWorkFile(multerFile(PDF_BYTES), FormatType.pdf),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
