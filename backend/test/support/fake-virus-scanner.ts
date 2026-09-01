import type { VirusScanResult } from '../../src/modules/files/virus-scan.service';

/**
 * Remplace `VirusScanService` dans les tests e2e qui téléversent un fichier
 * (couverture, photo, ouvrage) : ces tests exercent le stockage et la
 * validation de format, pas la disponibilité d'un vrai `clamd`. Jamais
 * exposée via une variable d'environnement (contrairement à
 * `PAYIN_PROVIDER=fake`) — un scanner toujours « propre » n'a aucune raison
 * légitime d'exister en dehors d'un module de test compilé explicitement ici,
 * jamais accessible par une simple mauvaise configuration en production.
 */
export function fakeVirusScanner(): {
  isConfigured: () => boolean;
  scan: (buffer: Buffer) => Promise<VirusScanResult>;
} {
  return {
    isConfigured: () => true,
    scan: () => Promise.resolve({ clean: true, signature: null }),
  };
}
