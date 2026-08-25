import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
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
  @IsString()
  @MinLength(32, {
    message:
      'SETUP_TOKEN doit compter au moins 32 caractères pour protéger la création du superadmin.',
  })
  SETUP_TOKEN: string = DEVELOPMENT_SETUP_TOKEN;
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

  return environment;
}
