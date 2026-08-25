import { Injectable } from '@nestjs/common';

const MAX_SAMPLES_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Limitation des extraits gratuits par adresse IP (audit §34).
 *
 * En mémoire, volontairement : contrairement aux tentatives de connexion, un
 * extrait n'a aucune valeur de sécurité et n'a pas besoin d'un compteur partagé
 * ni durable. Le but est d'empêcher l'aspiration en boucle du catalogue, pas de
 * tenir une comptabilité. À revoir le jour où l'API tournera en plusieurs
 * instances : chacune aurait alors son propre compteur.
 */
@Injectable()
export class SampleThrottleService {
  private readonly hits = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  /** Vrai si la requête est acceptée, faux si le seuil est dépassé. */
  accept(ipAddress: string): boolean {
    const now = Date.now();
    const current = this.hits.get(ipAddress);

    if (!current || current.expiresAt <= now) {
      this.purge(now);
      this.hits.set(ipAddress, { count: 1, expiresAt: now + WINDOW_MS });
      return true;
    }

    current.count += 1;

    return current.count <= MAX_SAMPLES_PER_WINDOW;
  }

  /** Évite que la table ne grossisse indéfiniment sur un serveur de longue durée. */
  private purge(now: number): void {
    for (const [key, value] of this.hits) {
      if (value.expiresAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
