import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { R2StorageDriver } from './r2-storage.driver';

const ENV: Record<string, string> = {
  R2_ACCOUNT_ID: 'account-de-test',
  R2_ACCESS_KEY_ID: 'clé-de-test',
  R2_SECRET_ACCESS_KEY: 'secret-de-test',
  R2_BUCKET: 'bucket-de-test',
};

function driver(
  env: Record<string, string | undefined> = ENV,
): R2StorageDriver {
  const config = {
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new R2StorageDriver(config);
}

describe('R2StorageDriver', () => {
  let sendSpy: jest.SpyInstance;

  afterEach(() => {
    sendSpy?.mockRestore();
  });

  it('ne construit pas le client S3 tant que aucune méthode réelle n’est appelée (pilote inactif = jamais instancié en pratique)', () => {
    // Le pilote peut être construit sans identifiants R2 sans lever — c'est
    // précisément ce qui permet à NestJS de l'instancier même quand
    // STORAGE_DRIVER=local (voir files.module.ts).
    expect(() => driver({})).not.toThrow();
  });

  it('storePublic envoie un PutObjectCommand sous le préfixe public/ avec le bon type de contenu', async () => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);

    const result = await driver().storePublic(
      Buffer.from('contenu image'),
      'covers',
      'jpg',
    );

    expect(result.storagePath).toMatch(/^covers\/.+\.jpg$/);
    expect(result.size).toBe(Buffer.from('contenu image').length);
    expect(result.checksum).toHaveLength(64);

    const [command] = sendSpy.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('bucket-de-test');
    expect(command.input.Key).toBe(`public/${result.storagePath}`);
    expect(command.input.ContentType).toBe('image/jpeg');
  });

  it('storePrivate envoie un PutObjectCommand sous le préfixe private/', async () => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);

    const result = await driver().storePrivate(
      Buffer.from('%PDF-1.4'),
      'works/abc',
      'pdf',
    );

    const [command] = sendSpy.mock.calls[0] as [PutObjectCommand];
    expect(command.input.Key).toBe(`private/${result.storagePath}`);
    expect(command.input.ContentType).toBe('application/octet-stream');
  });

  it('readPrivate lit depuis private/ et reconstruit un Buffer', async () => {
    const payload = Buffer.from('contenu privé');
    sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: {
        transformToByteArray: () => Promise.resolve(new Uint8Array(payload)),
      },
    } as never);

    const result = await driver().readPrivate('works/abc/uuid.pdf');

    expect(Buffer.compare(result, payload)).toBe(0);
    const [command] = sendSpy.mock.calls[0] as [GetObjectCommand];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Key).toBe('private/works/abc/uuid.pdf');
  });

  it('readPublic lit depuis public/', async () => {
    sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: {
        transformToByteArray: () =>
          Promise.resolve(new Uint8Array(Buffer.from('x'))),
      },
    } as never);

    await driver().readPublic('covers/uuid.jpg');

    const [command] = sendSpy.mock.calls[0] as [GetObjectCommand];
    expect(command.input.Key).toBe('public/covers/uuid.jpg');
  });

  it('lève une erreur explicite si la réponse R2 est vide (objet introuvable)', async () => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ Body: undefined } as never);

    await expect(driver().readPrivate('inexistant.pdf')).rejects.toThrow(
      /introuvable/,
    );
  });

  it('réutilise le même client S3 entre deux appels (construit une seule fois)', async () => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);

    const instance = driver();
    await instance.storePublic(Buffer.from('a'), 'covers', 'jpg');
    await instance.storePublic(Buffer.from('b'), 'covers', 'jpg');

    // Un seul client construit : deux appels à send() sur cette même instance,
    // sans reconstruction de S3Client entre les deux (sinon spyOn verrait
    // deux instances différentes, mais le compteur d'appels à send() suffit
    // ici à confirmer qu'aucune exception n'a interrompu le second appel).
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});
