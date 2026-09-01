import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicFilesController } from './public-files.controller';

function fakeStorage(overrides: { readPublic?: jest.Mock } = {}) {
  return {
    storePublic: jest.fn(),
    storePrivate: jest.fn(),
    readPrivate: jest.fn(),
    readPublic: jest.fn().mockRejectedValue(new Error('ENOENT')),
    ...overrides,
  };
}

function fakeResponse() {
  return { set: jest.fn() };
}

describe('PublicFilesController', () => {
  it('sert un fichier existant avec le bon type de contenu', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const storage = fakeStorage({
      readPublic: jest.fn().mockResolvedValue(buffer),
    });
    const controller = new PublicFilesController(storage);
    const response = fakeResponse();

    const result = await controller.serve(
      ['covers', 'uuid.jpg'],
      response as never,
    );

    expect(storage.readPublic).toHaveBeenCalledWith('covers/uuid.jpg');
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'image/jpeg' }),
    );

    const chunks: Buffer[] = [];
    for await (const chunk of result.getStream()) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks)).toEqual(buffer);
  });

  it('refuse une remontée d’arborescence (..) sans jamais interroger le stockage', async () => {
    const storage = fakeStorage();
    const controller = new PublicFilesController(storage);

    await expect(
      controller.serve(['..', 'etc', 'passwd'], fakeResponse() as never),
    ).rejects.toThrow(BadRequestException);
    expect(storage.readPublic).not.toHaveBeenCalled();
  });

  it('refuse un segment contenant un antislash', async () => {
    const storage = fakeStorage();
    const controller = new PublicFilesController(storage);

    await expect(
      controller.serve(['covers\\..\\private'], fakeResponse() as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('renvoie un 404 générique quand le fichier est introuvable, sans fuiter le détail du pilote', async () => {
    const storage = fakeStorage({
      readPublic: jest
        .fn()
        .mockRejectedValue(new Error('NoSuchKey: le detail interne de R2')),
    });
    const controller = new PublicFilesController(storage);

    await expect(
      controller.serve(['covers', 'inexistant.jpg'], fakeResponse() as never),
    ).rejects.toThrow(NotFoundException);
  });
});
