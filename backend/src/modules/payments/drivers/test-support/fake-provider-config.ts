import { credentialFieldsFor } from '../../provider-credential-schema';
import { MissingProviderCredentialError } from '../../provider-errors';
import type { ProviderConfigService } from '../../provider-config.service';

/**
 * Double de `ProviderConfigService` pour les tests de pilote : lit
 * directement la variable `.env` de repli déclarée dans
 * `PROVIDER_CREDENTIAL_SCHEMAS`, sans base de données — les pilotes ne
 * connaissent que l'interface `get`/`getOptional`, jamais Prisma.
 */
export function fakeProviderConfig(
  env: Record<string, string | undefined>,
): ProviderConfigService {
  const get = (providerCode: string, key: string): Promise<string> => {
    const spec = credentialFieldsFor(providerCode).find(
      (field) => field.key === key,
    );
    const value = spec?.envFallback ? env[spec.envFallback] : undefined;
    if (!value) {
      return Promise.reject(
        new MissingProviderCredentialError(providerCode, key),
      );
    }
    return Promise.resolve(value);
  };

  const getOptional = async (
    providerCode: string,
    key: string,
  ): Promise<string | undefined> => {
    try {
      return await get(providerCode, key);
    } catch (error) {
      if (error instanceof MissingProviderCredentialError) return undefined;
      throw error;
    }
  };

  return { get, getOptional } as unknown as ProviderConfigService;
}
