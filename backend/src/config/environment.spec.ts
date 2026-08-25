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
});
