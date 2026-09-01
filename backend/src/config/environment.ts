import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  development = 'development',
  test = 'test',
  production = 'production',
}

/**
 * Environnement de paiement, indépendant de `NODE_ENV` : un serveur en
 * `NODE_ENV=production` peut délibérément rester en `PAYMENT_ENV=sandbox`
 * tant que les identifiants réels des prestataires n'ont pas été fournis
 * (brief : « sandbox-first, aucune clé de production pendant ce chantier »).
 */
export enum PaymentEnvironment {
  sandbox = 'sandbox',
  production = 'production',
}

/**
 * Pilote de stockage des fichiers (couvertures, photos, ouvrages) — `local`
 * par défaut (disque, via le volume Docker `backend-storage`), `r2` une fois
 * les identifiants Cloudflare R2 ci-dessous renseignés. Voir `storage-driver.ts` :
 * même principe que `PaymentDriver`, le reste de l'application ne sait jamais
 * lequel est actif.
 */
export enum StorageDriverType {
  local = 'local',
  r2 = 'r2',
}

/**
 * Secret de développement, volontairement reconnaissable : il ne protège rien et
 * ne doit jamais servir ailleurs qu'en local ou en intégration continue.
 */
const DEVELOPMENT_WEBHOOK_SECRET = 'secret-de-developpement-gebook-a-remplacer';

/** Même logique que `DEVELOPMENT_WEBHOOK_SECRET`, pour le jeton de configuration initiale. */
const DEVELOPMENT_SETUP_TOKEN = 'jeton-de-developpement-gebook-a-remplacer';

/**
 * Variables d'environnement attendues par l'API.
 *
 * Le démarrage échoue si l'une d'elles manque ou est invalide : mieux vaut un refus
 * explicite qu'une application qui démarre à moitié configurée et fuit une trace
 * d'exception en production (audit S-03).
 */
export class Environment {
  @IsEnum(NodeEnvironment, {
    message: `NODE_ENV doit valoir « development », « test » ou « production ».`,
  })
  NODE_ENV: NodeEnvironment = NodeEnvironment.development;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'PORT doit être un nombre entier.' })
  @Min(1, { message: 'PORT doit être compris entre 1 et 65535.' })
  @Max(65535, { message: 'PORT doit être compris entre 1 et 65535.' })
  PORT = 3001;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL est obligatoire.' })
  DATABASE_URL!: string;

  /**
   * Liste explicite des origines autorisées, séparées par des virgules.
   * Jamais `*` : le cookie de session est envoyé avec `credentials`, une origine
   * ouverte reviendrait à laisser n'importe quel site agir au nom du lecteur.
   */
  @Transform(({ value }): string[] =>
    String(value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  @IsString({ each: true })
  @ArrayNotEmpty({
    message: 'CORS_ORIGINS doit lister au moins une origine autorisée.',
  })
  CORS_ORIGINS!: string[];

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  APP_DEBUG = false;

  /**
   * Secret de signature des notifications de paiement.
   *
   * Sa place est ici et nulle part ailleurs : jamais en base, jamais dans Git
   * (audit §33, S-01). Une valeur de développement est fournie par défaut pour
   * que le prestataire de simulation fonctionne sans configuration, mais le
   * démarrage en production est refusé tant qu'elle n'a pas été remplacée.
   */
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined
      ? DEVELOPMENT_WEBHOOK_SECRET
      : (value as string),
  )
  @IsString()
  @MinLength(32, {
    message:
      'PAYMENT_WEBHOOK_SECRET doit compter au moins 32 caractères pour signer les notifications de paiement.',
  })
  PAYMENT_WEBHOOK_SECRET: string = DEVELOPMENT_WEBHOOK_SECRET;

  /**
   * Jeton exigé par l'assistant de configuration initiale (`POST /setup/superadmin`)
   * pour créer le tout premier compte superadmin de la plateforme (audit §33, S-01) :
   * même traitement que `PAYMENT_WEBHOOK_SECRET`, jamais en base, jamais dans Git.
   */
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined
      ? DEVELOPMENT_SETUP_TOKEN
      : (value as string),
  )
  @IsString()
  @MinLength(32, {
    message:
      'SETUP_TOKEN doit compter au moins 32 caractères pour protéger la création du superadmin.',
  })
  SETUP_TOKEN: string = DEVELOPMENT_SETUP_TOKEN;

  // ---------------------------------------------------------------------
  // Plateforme de paiement (Phase 1) — routage pay-in/payout configurable
  // par variable d'environnement uniquement, sans toucher au code (brief §2).
  // Toutes les clés de prestataire sont optionnelles : leur absence ne bloque
  // pas le démarrage, elle rend seulement ce prestataire indisponible
  // (`PaymentDriverRegistry`/`PayoutDriverRegistry` renvoient 503, pas une
  // erreur de configuration au démarrage).
  // ---------------------------------------------------------------------

  @IsEnum(PaymentEnvironment, {
    message: 'PAYMENT_ENV doit valoir « sandbox » ou « production ».',
  })
  PAYMENT_ENV: PaymentEnvironment = PaymentEnvironment.sandbox;

  /** Code `payment_providers.code` du pilote pay-in par défaut (ex. `fake`, `pawapay`). */
  @IsOptional()
  @IsString()
  PAYIN_PROVIDER?: string;

  /** Code `payment_providers.code` du pilote payout par défaut. */
  @IsOptional()
  @IsString()
  PAYOUT_PROVIDER?: string;

  @IsOptional()
  @IsString()
  PAWAPAY_API_URL?: string;

  /** Jamais journalisée, jamais renvoyée par une route Superadmin — brief : « ne jamais exposer les secrets ». */
  @IsOptional()
  @IsString()
  PAWAPAY_API_TOKEN?: string;

  @IsOptional()
  @IsString()
  CINETPAY_API_URL?: string;

  @IsOptional()
  @IsString()
  CINETPAY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CINETPAY_SITE_ID?: string;

  /** Distincte de `CINETPAY_API_KEY` — sert uniquement à vérifier le X-TOKEN
   * HMAC des notifications, jamais aux appels d'API sortants. */
  @IsOptional()
  @IsString()
  CINETPAY_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  FEEXPAY_API_URL?: string;

  @IsOptional()
  @IsString()
  FEEXPAY_API_KEY?: string;

  /** Identifiant de boutique FeexPay (menu Développeurs), distinct de la clé
   * d'API — exigé dans le corps de chaque appel payin/payout. */
  @IsOptional()
  @IsString()
  FEEXPAY_SHOP_ID?: string;

  /**
   * URL publique de CETTE API (pas celle du frontend — voir `CORS_ORIGINS`
   * pour ça), utilisée pour construire les `notify_url` que certains
   * prestataires (CinetPay) exigent explicitement à l'initialisation d'un
   * paiement. Optionnelle : sans elle, un prestataire qui en a besoin reste
   * simplement indisponible plutôt que de recevoir une URL locale
   * injoignable en silence.
   */
  @IsOptional()
  @IsString()
  API_PUBLIC_URL?: string;

  // ---------------------------------------------------------------------
  // Scan antivirus (ClamAV) — tout fichier téléversé par un utilisateur
  // (couverture, photo d'auteur, ouvrage numérique) passe par `clamd` avant
  // d'être stocké. Optionnelles comme le reste de cette section : sans elles,
  // ce n'est pas le démarrage qui échoue, ce sont les téléversements qui
  // deviennent indisponibles (503) — jamais un scan silencieusement ignoré.
  // ---------------------------------------------------------------------

  @IsOptional()
  @IsString()
  CLAMAV_HOST?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt({ message: 'CLAMAV_PORT doit être un nombre entier.' })
  @Min(1, { message: 'CLAMAV_PORT doit être compris entre 1 et 65535.' })
  @Max(65535, { message: 'CLAMAV_PORT doit être compris entre 1 et 65535.' })
  CLAMAV_PORT?: number;

  // ---------------------------------------------------------------------
  // Stockage des fichiers — voir StorageDriverType ci-dessus. Les identifiants
  // R2 restent optionnels au niveau de la validation : c'est `STORAGE_DRIVER`
  // qui décide s'ils sont réellement nécessaires (voir `files.module.ts`,
  // qui refuse de démarrer si `STORAGE_DRIVER=r2` sans eux — un mauvais
  // réglage de stockage doit être détecté au démarrage, pas au premier
  // téléversement).
  // ---------------------------------------------------------------------

  @IsEnum(StorageDriverType, {
    message: 'STORAGE_DRIVER doit valoir « local » ou « r2 ».',
  })
  STORAGE_DRIVER: StorageDriverType = StorageDriverType.local;

  @IsOptional()
  @IsString()
  R2_ACCOUNT_ID?: string;

  @IsOptional()
  @IsString()
  R2_ACCESS_KEY_ID?: string;

  /** Jamais journalisée, jamais renvoyée par une route Superadmin. */
  @IsOptional()
  @IsString()
  R2_SECRET_ACCESS_KEY?: string;

  /**
   * Un seul bucket, avec des préfixes internes `public/`/`private/` — voir
   * `r2-storage.driver.ts`. Un seul bucket à créer côté Cloudflare, jamais
   * besoin d'y activer un accès public : `PublicFilesController` reste
   * l'unique porte de sortie des fichiers publics, exactement comme sur
   * disque local.
   */
  @IsOptional()
  @IsString()
  R2_BUCKET?: string;
}

/**
 * Appelée par `ConfigModule` au démarrage. Lève une erreur lisible listant tous les
 * problèmes d'un coup, plutôt que de s'arrêter au premier.
 */
export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(environment, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(' '))
      .join('\n  - ');

    throw new Error(`Configuration d'environnement invalide :\n  - ${details}`);
  }

  if (
    environment.NODE_ENV === NodeEnvironment.production &&
    environment.APP_DEBUG
  ) {
    throw new Error(
      'Configuration refusée : APP_DEBUG ne peut pas être actif lorsque NODE_ENV vaut « production ». ' +
        'Le mode débogage expose des informations internes dans les réponses HTTP.',
    );
  }

  if (
    environment.NODE_ENV === NodeEnvironment.production &&
    environment.PAYMENT_WEBHOOK_SECRET === DEVELOPMENT_WEBHOOK_SECRET
  ) {
    throw new Error(
      'Configuration refusée : PAYMENT_WEBHOOK_SECRET a gardé sa valeur de développement. ' +
        'Une notification de paiement pourrait alors être forgée par quiconque connaît le dépôt.',
    );
  }

  if (
    environment.NODE_ENV === NodeEnvironment.production &&
    environment.SETUP_TOKEN === DEVELOPMENT_SETUP_TOKEN
  ) {
    throw new Error(
      'Configuration refusée : SETUP_TOKEN a gardé sa valeur de développement. ' +
        'Quiconque connaît le dépôt pourrait alors créer le compte superadmin de la plateforme.',
    );
  }

  if (environment.STORAGE_DRIVER === StorageDriverType.r2) {
    const missing = (
      [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
      ] as const
    ).filter((key) => !environment[key]);

    if (missing.length > 0) {
      throw new Error(
        `Configuration refusée : STORAGE_DRIVER=r2 exige ${missing.join(', ')}. ` +
          'Un mauvais réglage de stockage doit être détecté au démarrage, pas au premier téléversement.',
      );
    }
  }

  return environment;
}
