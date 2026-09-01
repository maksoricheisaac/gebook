import { createServer, type Server, type Socket } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import {
  VirusScanService,
  VirusScanUnavailableError,
} from './virus-scan.service';

const HOST = '127.0.0.1';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = { CLAMAV_HOST: HOST, ...overrides };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Lit un flux `INSTREAM` (blocs préfixés par leur taille) jusqu'au bloc
 * terminateur de taille zéro — sans jamais rien décompresser, exactement ce
 * qu'un vrai `clamd` reçoit avant de répondre. */
function readInstream(
  socket: Socket,
  onComplete: (body: Buffer) => void,
): void {
  let buffered = Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let sawHeader = false;

  socket.on('data', (data: Buffer) => {
    buffered = Buffer.concat([buffered, data]);

    if (!sawHeader) {
      const headerEnd = buffered.indexOf('\0');
      if (headerEnd === -1) return;
      buffered = buffered.subarray(headerEnd + 1);
      sawHeader = true;
    }

    for (;;) {
      if (buffered.length < 4) return;
      const size = buffered.readUInt32BE(0);
      if (size === 0) {
        onComplete(Buffer.concat(chunks));
        return;
      }
      if (buffered.length < 4 + size) return;
      chunks.push(buffered.subarray(4, 4 + size));
      buffered = buffered.subarray(4 + size);
    }
  });
}

/** Démarre un faux `clamd` qui répond `response` une fois le flux entièrement
 * reçu — ou qui ne répond jamais si `response` est `null` (simule un scan
 * qui ne se termine jamais). */
function startFakeClamd(
  response: string | null,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      readInstream(socket, () => {
        if (response !== null) {
          socket.end(`${response}\0`);
        }
        // `response === null` : le socket reste ouvert sans rien renvoyer,
        // pour exercer le délai d'expiration côté client.
      });
    });
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

describe('VirusScanService', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("signale l'absence de configuration sans tenter de connexion", async () => {
    const service = new VirusScanService(config({ CLAMAV_HOST: undefined }));

    await expect(service.scan(Buffer.from('contenu'))).rejects.toThrow(
      VirusScanUnavailableError,
    );
  });

  it('reconnaît un fichier propre (stream: OK)', async () => {
    const fake = await startFakeClamd('stream: OK');
    server = fake.server;
    const service = new VirusScanService(config({ CLAMAV_PORT: fake.port }));

    const result = await service.scan(Buffer.from('contenu inoffensif'));

    expect(result).toEqual({ clean: true, signature: null });
  });

  it('reconnaît un fichier infecté (stream: ... FOUND) et extrait la signature', async () => {
    const fake = await startFakeClamd('stream: Eicar-Test-Signature FOUND');
    server = fake.server;
    const service = new VirusScanService(config({ CLAMAV_PORT: fake.port }));

    const result = await service.scan(Buffer.from('contenu suspect'));

    expect(result).toEqual({
      clean: false,
      signature: 'Eicar-Test-Signature',
    });
  });

  it('transmet correctement un contenu qui dépasse la taille d’un seul bloc', async () => {
    const large = Buffer.alloc(200_000, 0x41);
    const fake = await startFakeClamd('stream: OK');
    server = fake.server;
    const service = new VirusScanService(config({ CLAMAV_PORT: fake.port }));

    const result = await service.scan(large);

    expect(result.clean).toBe(true);
  });

  it('refuse le fichier sur une réponse ni OK ni FOUND (ex. limite dépassée côté clamd)', async () => {
    const fake = await startFakeClamd(
      'stream: INSTREAM size limit exceeded. ERROR',
    );
    server = fake.server;
    const service = new VirusScanService(config({ CLAMAV_PORT: fake.port }));

    await expect(service.scan(Buffer.from('contenu'))).rejects.toThrow(
      VirusScanUnavailableError,
    );
  });

  it("refuse le fichier si clamd n'est pas joignable", async () => {
    // Un port réellement fermé (pas seulement « improbable ») : ouvert puis
    // aussitôt refermé, pour un refus de connexion rapide et fiable — se
    // fier à un port bas/réservé comme 1 dépend trop du pare-feu de l'hôte
    // (observé : jusqu'à 37 minutes sur ce poste Windows avant l'échec).
    const closedPort = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, HOST, () => {
        const address = probe.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        probe.close(() => resolve(port));
      });
    });

    const service = new VirusScanService(config({ CLAMAV_PORT: closedPort }));

    await expect(service.scan(Buffer.from('contenu'))).rejects.toThrow(
      VirusScanUnavailableError,
    );
  });

  it('isConfigured() reflète la présence de CLAMAV_HOST', () => {
    expect(new VirusScanService(config()).isConfigured()).toBe(true);
    expect(
      new VirusScanService(config({ CLAMAV_HOST: undefined })).isConfigured(),
    ).toBe(false);
  });
});
