import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import type { ConnectionTestResult } from './payment-driver';
import { PaymentDriverRegistry } from './payment-driver.registry';
import { PayoutDriverRegistry } from './payout-driver.registry';

/**
 * Variables d'environnement requises pour que le pilote de CE prestataire soit
 * réellement joignable — jamais leurs valeurs, seulement leur présence. La
 * plateforme Superadmin lit ceci en lecture seule (brief §9 : « si les secrets
 * restent exclusivement en .env, ne construis pas une interface qui prétend les
 * gérer en base — juste un affichage en lecture seule dérivé de l'environnement »).
 */
const PROVIDER_ENV_REQUIREMENTS: Record<string, readonly string[]> = {
  fake: [],
  pawapay: ['PAWAPAY_API_URL', 'PAWAPAY_API_TOKEN'],
  cinetpay: ['CINETPAY_API_URL', 'CINETPAY_API_KEY', 'CINETPAY_SITE_ID'],
  feexpay: ['FEEXPAY_API_URL', 'FEEXPAY_API_KEY'],
};

export interface AdminPaymentProviderResponse {
  code: string;
  name: string;
  environment: string;
  status: string;
  supportsMobileMoney: boolean;
  supportsCard: boolean;
  supportsRefund: boolean;
  supportsPayout: boolean;
  priority: number;
  payinDriverInstalled: boolean;
  payoutDriverInstalled: boolean;
  /** `true` si toutes les variables d'environnement requises sont renseignées. */
  configured: boolean;
  /** Noms des variables manquantes — jamais leur valeur. */
  missingEnvVars: string[];
}

export interface AdminProviderConnectionTestResponse {
  code: string;
  payin: ConnectionTestResult | null;
  payout: ConnectionTestResult | null;
}

const NOT_INSTALLED = (
  direction: 'pay-in' | 'payout',
): ConnectionTestResult => ({
  ok: false,
  detail: `Échec — Cause : aucun pilote ${direction} installé pour ce prestataire.`,
});

const NO_TEST_IMPLEMENTED: ConnectionTestResult = {
  ok: false,
  detail: 'Aucun test de connectivité implémenté pour ce pilote.',
};

@Injectable()
export class AdminPaymentProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payinDrivers: PaymentDriverRegistry,
    private readonly payoutDrivers: PayoutDriverRegistry,
  ) {}

  async list(): Promise<AdminPaymentProviderResponse[]> {
    const providers = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProvider.findMany({ orderBy: { priority: 'asc' } }),
    );

    return providers.map((provider) => this.toResponse(provider));
  }

  async testConnection(
    code: string,
  ): Promise<AdminProviderConnectionTestResponse> {
    const provider = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProvider.findUnique({ where: { code } }),
    );

    if (!provider) {
      throw new NotFoundException(
        'Ce prestataire de paiement est introuvable.',
      );
    }

    const payin = this.payinDrivers.has(code)
      ? await (this.payinDrivers.resolve(code).testConnection?.() ??
          Promise.resolve(NO_TEST_IMPLEMENTED))
      : NOT_INSTALLED('pay-in');

    const payout = provider.supportsPayout
      ? this.payoutDrivers.has(code)
        ? await (this.payoutDrivers.resolve(code).testConnection?.() ??
            Promise.resolve(NO_TEST_IMPLEMENTED))
        : NOT_INSTALLED('payout')
      : null;

    return { code, payin, payout };
  }

  private toResponse(provider: {
    code: string;
    name: string;
    environment: string;
    status: string;
    supportsMobileMoney: boolean;
    supportsCard: boolean;
    supportsRefund: boolean;
    supportsPayout: boolean;
    priority: number;
  }): AdminPaymentProviderResponse {
    const required = PROVIDER_ENV_REQUIREMENTS[provider.code] ?? [];
    const missingEnvVars = required.filter(
      (key) => !this.config.get<string>(key),
    );

    return {
      code: provider.code,
      name: provider.name,
      environment: provider.environment,
      status: provider.status,
      supportsMobileMoney: provider.supportsMobileMoney,
      supportsCard: provider.supportsCard,
      supportsRefund: provider.supportsRefund,
      supportsPayout: provider.supportsPayout,
      priority: provider.priority,
      payinDriverInstalled: this.payinDrivers.has(provider.code),
      payoutDriverInstalled: this.payoutDrivers.has(provider.code),
      configured: missingEnvVars.length === 0,
      missingEnvVars,
    };
  }
}
