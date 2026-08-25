import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { NodeEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === NodeEnvironment.production;

  const app = await NestFactory.create(AppModule, {
    // Conserve le corps brut des requêtes : sans lui, aucune signature de webhook
    // de paiement ne peut être recalculée (audit §33). `JSON.parse` suivi de
    // `JSON.stringify` ne redonne pas les octets signés par le prestataire.
    rawBody: true,
    logger: new ConsoleLogger({
      // Journal structuré en production, lisible en développement.
      json: isProduction,
      colors: !isProduction,
    }),
  });

  const config = app.get(ConfigService);

  app.use(helmet());
  // Le jeton de session vit dans un cookie httpOnly : `cookie-parser` est ce qui le
  // rend lisible sur `req.cookies` sans qu'aucun JavaScript côté client n'y touche.
  app.use(cookieParser());

  app.enableCors({
    // Liste explicite d'origines, jamais `*` : le cookie de session est transmis
    // avec `credentials`, une origine ouverte reviendrait à l'offrir à tout site.
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Tout champ non déclaré dans un DTO est retiré, puis refusé : le client ne
      // peut pas glisser une propriété inattendue dans une écriture.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Les erreurs sortent indexées par champ plutôt qu'en tableau plat.
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
