import { NodeEnvironment, validateEnvironment } from './environment';

const baseEnvironment = {
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/gebook_db',
  CORS_ORIGINS: 'http://localhost:3000',
  APP_DEBUG: 'true',
};

const PRODUCTION_WEBHOOK_SECRET =
  'un-secret-de-production-suffisamment-long-pour-etre-accepte';

const PRODUCTION_SETUP_TOKEN =
  'un-jeton-de-configuration-suffisamment-long-pour-etre-accepte';

const PRODUCTION_ENCRYPTION_KEY = 'b'.repeat(64);

const PRODUCTION_TURNSTILE_SECRET_KEY =
  'un-secret-turnstile-de-production-suffisamment-long';

describe('validateEnvironment', () => {
  it('accepte une configuration complète et convertit les types', () => {
    const environment = validateEnvironment(baseEnvironment);

    expect(environment.NODE_ENV).toBe(NodeEnvironment.development);
    expect(environment.PORT).toBe(3001);
    expect(environment.APP_DEBUG).toBe(true);
    expect(environment.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('découpe la liste des origines autorisées', () => {
    const environment = validateEnvironment({
      ...baseEnvironment,
      CORS_ORIGINS: 'http://localhost:3000, https://gebook.cg',
    });

    expect(environment.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://gebook.cg',
    ]);
  });

  it('refuse le démarrage si DATABASE_URL est absente', () => {
    const incomplete: Record<string, string> = { ...baseEnvironment };
    delete incomplete.DATABASE_URL;

    expect(() => validateEnvironment(incomplete)).toThrow(
      /DATABASE_URL est obligatoire/,
    );
  });

  it('refuse le démarrage si aucune origine n’est autorisée', () => {
    expect(() =>
      validateEnvironment({ ...baseEnvironment, CORS_ORIGINS: '' }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('refuse un port hors bornes', () => {
    expect(() =>
      validateEnvironment({ ...baseEnvironment, PORT: '70000' }),
    ).toThrow(/PORT/);
  });

  it('refuse le mode débogage en production', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'true',
      }),
    ).toThrow(/APP_DEBUG/);
  });

  it('accepte la production lorsque le débogage est désactivé', () => {
    const environment = validateEnvironment({
      ...baseEnvironment,
      NODE_ENV: 'production',
      APP_DEBUG: 'false',
      PAYMENT_WEBHOOK_SECRET: PRODUCTION_WEBHOOK_SECRET,
      SETUP_TOKEN: PRODUCTION_SETUP_TOKEN,
      CREDENTIALS_ENCRYPTION_KEY: PRODUCTION_ENCRYPTION_KEY,
      TURNSTILE_SECRET_KEY: PRODUCTION_TURNSTILE_SECRET_KEY,
    });

    expect(environment.NODE_ENV).toBe(NodeEnvironment.production);
    expect(environment.APP_DEBUG).toBe(false);
  });

  it('fournit un secret de webhook par défaut hors production', () => {
    expect(
      validateEnvironment(baseEnvironment).PAYMENT_WEBHOOK_SECRET.length,
    ).toBeGreaterThanOrEqual(32);
  });

  it('refuse un secret de webhook trop court', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        PAYMENT_WEBHOOK_SECRET: 'trop-court',
      }),
    ).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it('refuse la production tant que le secret de développement n’a pas été remplacé', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'false',
      }),
    ).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it('fournit un jeton de configuration par défaut hors production', () => {
    expect(
      validateEnvironment(baseEnvironment).SETUP_TOKEN.length,
    ).toBeGreaterThanOrEqual(32);
  });

  it('refuse un jeton de configuration trop court', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        SETUP_TOKEN: 'trop-court',
      }),
    ).toThrow(/SETUP_TOKEN/);
  });

  it('refuse la production tant que le jeton de configuration par défaut n’a pas été remplacé', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'false',
        PAYMENT_WEBHOOK_SECRET: PRODUCTION_WEBHOOK_SECRET,
      }),
    ).toThrow(/SETUP_TOKEN/);
  });

  it('fournit une clé de chiffrement des identifiants par défaut hors production', () => {
    expect(
      validateEnvironment(baseEnvironment).CREDENTIALS_ENCRYPTION_KEY.length,
    ).toBe(64);
  });

  it('refuse une clé de chiffrement qui ne représente pas 32 octets', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        CREDENTIALS_ENCRYPTION_KEY: 'trop-court',
      }),
    ).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });

  it('refuse la production tant que la clé de chiffrement par défaut n’a pas été remplacée', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'false',
        PAYMENT_WEBHOOK_SECRET: PRODUCTION_WEBHOOK_SECRET,
        SETUP_TOKEN: PRODUCTION_SETUP_TOKEN,
      }),
    ).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });

  it('fournit une clé secrète Turnstile de test par défaut hors production', () => {
    expect(validateEnvironment(baseEnvironment).TURNSTILE_SECRET_KEY).toBe(
      '1x0000000000000000000000000000000AA',
    );
  });

  it('refuse la production tant que la clé Turnstile de test n’a pas été remplacée', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'false',
        PAYMENT_WEBHOOK_SECRET: PRODUCTION_WEBHOOK_SECRET,
        SETUP_TOKEN: PRODUCTION_SETUP_TOKEN,
        CREDENTIALS_ENCRYPTION_KEY: PRODUCTION_ENCRYPTION_KEY,
      }),
    ).toThrow(/TURNSTILE_SECRET_KEY/);
  });
});

describe('validateEnvironment — FeexPay', () => {
  it('accepte une configuration FeexPay valide', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        FEEXPAY_API_URL: 'https://api-v2.feexpay.me',
        FEEXPAY_NETWORK: 'mtn_cg',
        FEEXPAY_MIN_AMOUNT: '100',
        FEEXPAY_MAX_AMOUNT: '2000000',
      }),
    ).not.toThrow();
  });

  it('traite les valeurs vides du .env.example comme absentes', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        FEEXPAY_API_URL: '',
        FEEXPAY_NETWORK: '',
        FEEXPAY_MIN_AMOUNT: '',
      }),
    ).not.toThrow();
  });

  it.each([
    [{ FEEXPAY_API_URL: 'pas une url' }, /FEEXPAY_API_URL/],
    [{ FEEXPAY_NETWORK: 'MTN CG' }, /FEEXPAY_NETWORK/],
    [{ FEEXPAY_MIN_AMOUNT: '-5' }, /FEEXPAY_MIN_AMOUNT/],
    [{ FEEXPAY_MAX_AMOUNT: '10.5' }, /FEEXPAY_MAX_AMOUNT/],
    [
      { FEEXPAY_MIN_AMOUNT: '500', FEEXPAY_MAX_AMOUNT: '100' },
      /ne peut pas dépasser/,
    ],
  ])('refuse %j au démarrage', (extra, message) => {
    expect(() => validateEnvironment({ ...baseEnvironment, ...extra })).toThrow(
      message,
    );
  });

  it('refuse une URL FeexPay en clair (http) en production', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        APP_DEBUG: 'false',
        PAYMENT_WEBHOOK_SECRET: PRODUCTION_WEBHOOK_SECRET,
        SETUP_TOKEN: PRODUCTION_SETUP_TOKEN,
        CREDENTIALS_ENCRYPTION_KEY: PRODUCTION_ENCRYPTION_KEY,
        TURNSTILE_SECRET_KEY: PRODUCTION_TURNSTILE_SECRET_KEY,
        FEEXPAY_API_URL: 'http://api-v2.feexpay.me',
      }),
    ).toThrow(/HTTPS/);
  });
});
