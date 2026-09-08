import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CONTEXT } from '../../prisma/rls-context';
import { MissingProviderCredentialError } from './provider-errors';
import {
  credentialFieldsFor,
  type CredentialFieldSpec,
} from './provider-credential-schema';

export interface ConfiguredState {
  configured: boolean;
  /** Libellés des champs requis manquants — jamais un nom de variable d'environnement. */
  missingFields: string[];
}

export interface CredentialFieldState extends CredentialFieldSpec {
  /** Une valeur existe (base ou repli `.env`) — jamais la valeur elle-même. */
  hasValue: boolean;
}

/**
 * Résout la configuration d'un prestataire : d'abord `payment_provider_credentials`
 * (déchiffré via `EncryptionService`), puis repli sur la variable `.env`
 * correspondante (`CredentialFieldSpec.envFallback`) tant qu'aucune valeur n'a
 * été enregistrée depuis Superadmin → Paiements → Configurer — aucune
 * régression pour un déploiement qui n'a pas encore migré ses identifiants.
 */
@Injectable()
export class ProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  async get(providerCode: string, key: string): Promise<string> {
    const stored = await this.findStored(providerCode, key);
    if (stored !== null) {
      return this.encryption.decrypt(stored);
    }

    const spec = credentialFieldsFor(providerCode).find(
      (field) => field.key === key,
    );
    const fallback = spec?.envFallback
      ? this.config.get<string>(spec.envFallback)
      : undefined;

    if (!fallback) {
      throw new MissingProviderCredentialError(providerCode, key);
    }

    return fallback;
  }

  /** Repli conservé pour les champs optionnels (ex. `apiUrl`) : `undefined`
   * plutôt qu'une exception, laissant l'appelant appliquer son propre défaut. */
  async getOptional(
    providerCode: string,
    key: string,
  ): Promise<string | undefined> {
    try {
      return await this.get(providerCode, key);
    } catch (error) {
      if (error instanceof MissingProviderCredentialError) {
        return undefined;
      }
      throw error;
    }
  }

  async isFullyConfigured(providerCode: string): Promise<ConfiguredState> {
    const missingFields: string[] = [];

    for (const field of credentialFieldsFor(providerCode)) {
      if (!field.required) continue;
      try {
        await this.get(providerCode, field.key);
      } catch (error) {
        if (!(error instanceof MissingProviderCredentialError)) throw error;
        missingFields.push(field.label);
      }
    }

    return { configured: missingFields.length === 0, missingFields };
  }

  /** État par champ pour l'affichage du formulaire — `hasValue`, jamais la valeur. */
  async fieldStates(providerCode: string): Promise<CredentialFieldState[]> {
    const fields = credentialFieldsFor(providerCode);
    return Promise.all(
      fields.map(async (field) => ({
        ...field,
        hasValue:
          (await this.getOptional(providerCode, field.key)) !== undefined,
      })),
    );
  }

  /**
   * Enregistre les identifiants fournis. Un champ absent ou vide dans `values`
   * reste **inchangé** — jamais effacé implicitement, faute de quoi rouvrir le
   * formulaire (qui n'affiche jamais la valeur réelle) puis l'enregistrer sans
   * y toucher supprimerait silencieusement l'identifiant.
   */
  async setMany(
    providerCode: string,
    values: Record<string, string>,
  ): Promise<void> {
    const known = new Set(
      credentialFieldsFor(providerCode).map((field) => field.key),
    );
    const unknown = Object.keys(values).filter((key) => !known.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Champ(s) inconnu(s) pour ce prestataire : ${unknown.join(', ')}.`,
      );
    }

    const provider = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProvider.findUnique({
        where: { code: providerCode },
        select: { id: true },
      }),
    );
    if (!provider) return;

    const entries = Object.entries(values).filter(
      ([, value]) => value.trim().length > 0,
    );

    for (const [key, value] of entries) {
      const valueEncrypted = this.encryption.encrypt(value);
      await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
        tx.paymentProviderCredential.upsert({
          where: {
            paymentProviderId_key: { paymentProviderId: provider.id, key },
          },
          update: { valueEncrypted },
          create: { paymentProviderId: provider.id, key, valueEncrypted },
        }),
      );
    }
  }

  private async findStored(
    providerCode: string,
    key: string,
  ): Promise<string | null> {
    const row = await this.prisma.withRlsContext(SYSTEM_CONTEXT, (tx) =>
      tx.paymentProviderCredential.findFirst({
        where: { provider: { code: providerCode }, key },
        select: { valueEncrypted: true },
      }),
    );
    return row?.valueEncrypted ?? null;
  }
}
