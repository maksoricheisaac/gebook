import { Socket } from 'node:net';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_CLAMAV_PORT = 3310;
/** Un envoi trop lent ou un `clamd` qui ne répond plus ne doit jamais bloquer
 * indéfiniment une requête HTTP — mieux vaut un échec net (§ fail closed). */
const SCAN_TIMEOUT_MS = 30_000;
/** Taille de chaque bloc envoyé sur le protocole `INSTREAM` — une valeur
 * modeste, largement sous toute limite raisonnable côté `clamd`. */
const CHUNK_SIZE_BYTES = 64 * 1024;

export interface VirusScanResult {
  clean: boolean;
  /** Nom de signature détecté par ClamAV — jamais renvoyé au client, seulement
   * journalisé côté serveur (audit §71, même règle que pour les erreurs de
   * prestataire de paiement). */
  signature: string | null;
}

/** `clamd` n'est pas joignable, mal configuré, ou n'a pas pu conclure le scan
 * à temps — distincte d'un résultat « infecté », qui est un scan réussi. */
export class VirusScanUnavailableError extends Error {
  constructor(
    detail: string,
    override readonly cause?: unknown,
  ) {
    super(`Scan antivirus indisponible : ${detail}`);
    this.name = 'VirusScanUnavailableError';
  }
}

/**
 * Client du protocole `INSTREAM` de `clamd` (démon ClamAV), implémenté à la
 * main plutôt que via un paquet npm tiers : la surface est petite (un socket
 * TCP, des blocs préfixés par leur taille, une ligne de réponse) et ce code
 * touche des octets envoyés par n'importe quel visiteur avant tout stockage —
 * exactement le genre d'endroit où garder une visibilité totale sur ce qui
 * s'exécute compte plus que la commodité d'une dépendance (même principe que
 * `mime-sniffer.ts` : « ni un détecteur général, ni une dépendance externe
 * pour une poignée de signatures fixes »).
 *
 * Protocole (documenté par ClamAV) : le client envoie `zINSTREAM\0`, puis une
 * suite de blocs (préfixe 4 octets big-endian = taille du bloc, puis le
 * bloc), terminée par un bloc de taille zéro ; `clamd` répond une seule ligne
 * — `stream: OK`, `stream: <signature> FOUND`, ou `stream: <détail> ERROR`.
 *
 * Fail closed dans les deux sens : un fichier qui ressort `FOUND` est refusé,
 * et `clamd` injoignable ou trop lent refuse aussi le fichier plutôt que de
 * le laisser passer sans avoir été réellement scanné.
 */
@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('CLAMAV_HOST'));
  }

  async scan(buffer: Buffer): Promise<VirusScanResult> {
    const host = this.config.get<string>('CLAMAV_HOST');
    if (!host) {
      throw new VirusScanUnavailableError('CLAMAV_HOST non configuré.');
    }
    const port = this.config.get<number>('CLAMAV_PORT') ?? DEFAULT_CLAMAV_PORT;

    const response = await this.sendInstream(host, port, buffer);
    return this.parseResponse(response);
  }

  private sendInstream(
    host: string,
    port: number,
    buffer: Buffer,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const responseChunks: Buffer[] = [];
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };

      socket.setTimeout(SCAN_TIMEOUT_MS);
      socket.once('timeout', () => {
        finish(() =>
          reject(
            new VirusScanUnavailableError(
              `délai dépassé (${SCAN_TIMEOUT_MS / 1000}s) en contactant ${host}:${port}.`,
            ),
          ),
        );
      });
      socket.once('error', (error) => {
        finish(() =>
          reject(
            new VirusScanUnavailableError(
              `connexion à ${host}:${port} impossible.`,
              error,
            ),
          ),
        );
      });
      socket.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk);
      });
      socket.once('close', () => {
        finish(() => resolve(Buffer.concat(responseChunks).toString('utf8')));
      });

      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');
        for (
          let offset = 0;
          offset < buffer.length;
          offset += CHUNK_SIZE_BYTES
        ) {
          const slice = buffer.subarray(offset, offset + CHUNK_SIZE_BYTES);
          const sizePrefix = Buffer.alloc(4);
          sizePrefix.writeUInt32BE(slice.length, 0);
          socket.write(sizePrefix);
          socket.write(slice);
        }
        // Bloc de taille zéro : signale la fin du flux à `clamd`.
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });
    });
  }

  private parseResponse(raw: string): VirusScanResult {
    // `clamd` termine sa réponse par un octet nul — retiré avant lecture.
    const line = raw.replace(/\0+$/, '').trim();

    if (line.endsWith('OK')) {
      return { clean: true, signature: null };
    }

    const foundMatch = /stream:\s*(.+)\s+FOUND$/.exec(line);
    if (foundMatch) {
      const signature = foundMatch[1].trim();
      this.logger.warn(
        `Fichier refusé par ClamAV : signature « ${signature} ».`,
      );
      return { clean: false, signature };
    }

    // `INSTREAM size limit exceeded` et toute autre erreur protocolaire :
    // le fichier n'a pas été réellement scanné jusqu'au bout — jamais traité
    // comme un succès silencieux.
    throw new VirusScanUnavailableError(
      `réponse inattendue de clamd : « ${line || '(vide)'} ».`,
    );
  }
}
