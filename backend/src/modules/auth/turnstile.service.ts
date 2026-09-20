import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Vérification serveur d'un jeton Cloudflare Turnstile (inscription/connexion
 * — voir `TurnstileGuard`). `TURNSTILE_SECRET_KEY` garde par défaut la clé
 * secrète de test publique documentée par Cloudflare (toujours acceptée),
 * même principe que `DEVELOPMENT_WEBHOOK_SECRET` : le développement fonctionne
 * sans compte Cloudflare, et `validateEnvironment()` refuse le démarrage en
 * production tant qu'elle garde cette valeur.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    const secret = this.config.getOrThrow<string>('TURNSTILE_SECRET_KEY');

    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp,
    });

    let result: SiteverifyResponse;
    try {
      const response = await fetch(VERIFY_URL, { method: 'POST', body });
      result = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      // Cloudflare injoignable : refuser plutôt que de laisser passer sans
      // contrôle, même principe fail-closed que `MailService`/`VirusScanService`.
      this.logger.error(
        `Vérification Turnstile indisponible : ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    if (!result.success) {
      this.logger.warn(
        `Jeton Turnstile refusé : ${(result['error-codes'] ?? []).join(', ') || 'raison inconnue'}`,
      );
    }

    return result.success;
  }
}
