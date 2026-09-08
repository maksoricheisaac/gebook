import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SettingValueType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import {
  credentialValues,
  UpdateProviderConfigurationDto,
} from './dto/update-provider-configuration.dto';
import type { ConnectionTestResult } from './payment-driver';
import { PaymentDriverRegistry } from './payment-driver.registry';
import { PayoutDriverRegistry } from './payout-driver.registry';
import {
  type CredentialFieldState,
  ProviderConfigService,
} from './provider-config.service';

const DEFAULT_PROVIDER_SETTING_KEY = 'default_payment_provider';

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
  /** `true` si tous les champs d'identifiants requis sont renseignés (base ou repli `.env`). */
  configured: boolean;
  /** Libellés des champs requis manquants — jamais un nom de variable d'environnement. */
  missingFields: string[];
  /** État par champ pour le formulaire « Configurer » — `hasValue`, jamais la valeur. */
  credentialFields: CredentialFieldState[];
  /** Prestataire par défaut de la plateforme (`Setting.default_payment_provider`). */
  isDefault: boolean;
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
    private readonly payinDrivers: PaymentDriverRegistry,
    private readonly payoutDrivers: PayoutDriverRegistry,
    private readonly providerConfig: ProviderConfigService,
  ) {}

  async list(): Promise<AdminPaymentProviderResponse[]> {
    const [providers, defaultCode] = await Promise.all([
      this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.paymentProvider.findMany({ orderBy: { priority: 'asc' } }),
      ),
      this.defaultProviderCode(),
    ]);

    return Promise.all(
      providers.map((provider) => this.toResponse(provider, defaultCode)),
    );
  }

  /**
   * Identifiants + capacités/priorité en une seule requête — un unique bouton
   * « Enregistrer » côté Superadmin. `ProviderConfigService.setMany()` laisse
   * déjà inchangé tout champ absent/vide ; ce qui suit fait de même pour les
   * capacités/priorité (`data` ne porte que ce qui a été explicitement fourni).
   */
  async setConfiguration(
    code: string,
    dto: UpdateProviderConfigurationDto,
  ): Promise<AdminPaymentProviderResponse> {
    const existing = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProvider.findUnique({ where: { code } }),
    );
    if (!existing) {
      throw new NotFoundException(
        'Ce prestataire de paiement est introuvable.',
      );
    }

    const values = credentialValues(dto);
    if (Object.keys(values).length > 0) {
      await this.providerConfig.setMany(code, values);
    }

    const capabilityFields: Array<
      keyof Pick<
        UpdateProviderConfigurationDto,
        | 'supportsMobileMoney'
        | 'supportsCard'
        | 'supportsRefund'
        | 'supportsPayout'
        | 'priority'
      >
    > = [
      'supportsMobileMoney',
      'supportsCard',
      'supportsRefund',
      'supportsPayout',
      'priority',
    ];
    const data = Object.fromEntries(
      capabilityFields
        .filter((field) => dto[field] !== undefined)
        .map((field) => [field, dto[field]]),
    );

    const provider =
      Object.keys(data).length > 0
        ? await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
            tx.paymentProvider.update({ where: { code }, data }),
          )
        : existing;

    return this.toResponse(provider, await this.defaultProviderCode());
  }

  /**
   * Désigne le prestataire par défaut de la plateforme
   * (`Setting.default_payment_provider`, relu par
   * `PaymentsService.defaultProviderCode()` à chaque paiement sans prestataire
   * explicitement demandé). Refuse un prestataire non installé ou incomplet :
   * le désigner par défaut rendrait alors tout paiement sans `providerCode`
   * explicite immédiatement indisponible.
   */
  async setDefault(code: string): Promise<AdminPaymentProviderResponse> {
    const provider = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProvider.findUnique({ where: { code } }),
    );
    if (!provider) {
      throw new NotFoundException(
        'Ce prestataire de paiement est introuvable.',
      );
    }
    if (!this.payinDrivers.has(code)) {
      throw new BadRequestException(
        'Aucun pilote installé pour ce prestataire : il ne peut pas devenir le prestataire par défaut.',
      );
    }
    const { configured } = await this.providerConfig.isFullyConfigured(code);
    if (!configured) {
      throw new BadRequestException(
        'Ce prestataire n’est pas entièrement configuré : renseignez ses identifiants avant de le désigner par défaut.',
      );
    }

    await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.setting.upsert({
        where: { settingKey: DEFAULT_PROVIDER_SETTING_KEY },
        update: { settingValue: code },
        create: {
          settingKey: DEFAULT_PROVIDER_SETTING_KEY,
          settingValue: code,
          valueType: SettingValueType.string,
        },
      }),
    );

    return this.toResponse(provider, code);
  }

  /**
   * Bascule active/inactive — jamais `maintenance` ici (pas demandé par
   * cette page, réservée à un usage opérationnel plus fin ailleurs si
   * besoin). Aucune variable d'environnement à toucher : `status` est une
   * colonne ordinaire, et `PaymentsService#resolveProvider` la relit à
   * chaque nouveau paiement — l'effet est donc immédiat, pas seulement au
   * prochain redémarrage.
   */
  async updateStatus(
    code: string,
    status: 'active' | 'inactive',
  ): Promise<AdminPaymentProviderResponse> {
    const provider = await this.prisma.withRlsContext(
      SYSTEM_CONTEXT,
      async (tx) => {
        const existing = await tx.paymentProvider.findUnique({
          where: { code },
        });
        if (!existing) {
          throw new NotFoundException(
            'Ce prestataire de paiement est introuvable.',
          );
        }
        return tx.paymentProvider.update({ where: { code }, data: { status } });
      },
    );

    return this.toResponse(provider, await this.defaultProviderCode());
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

  private async toResponse(
    provider: {
      code: string;
      name: string;
      environment: string;
      status: string;
      supportsMobileMoney: boolean;
      supportsCard: boolean;
      supportsRefund: boolean;
      supportsPayout: boolean;
      priority: number;
    },
    defaultCode: string | null,
  ): Promise<AdminPaymentProviderResponse> {
    const [{ configured, missingFields }, credentialFields] = await Promise.all(
      [
        this.providerConfig.isFullyConfigured(provider.code),
        this.providerConfig.fieldStates(provider.code),
      ],
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
      configured,
      missingFields,
      credentialFields,
      isDefault: provider.code === defaultCode,
    };
  }

  private async defaultProviderCode(): Promise<string | null> {
    const setting = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.setting.findUnique({
        where: { settingKey: DEFAULT_PROVIDER_SETTING_KEY },
        select: { settingValue: true },
      }),
    );
    return setting?.settingValue ?? null;
  }
}
