import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Forme unique de toutes les réponses d'erreur de l'API. */
export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  /** Erreurs de validation, indexées par nom de champ. */
  errors?: Record<string, string[]>;
  path: string;
  timestamp: string;
}

/**
 * Filtre global des exceptions.
 *
 * Il garantit deux choses que l'ancienne version PHP ne garantissait pas : aucune
 * trace d'exception ne sort dans une réponse HTTP, et toute erreur serveur est
 * journalisée (audit S-03 et S-07).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const status: HttpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      statusCode: status,
      ...this.describe(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // La trace reste côté serveur : c'est le seul endroit où elle a sa place.
      this.logger.error(
        `${request.method} ${request.url} — ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} — ${status} ${body.message}`,
      );
    }

    response.status(status).json(body);
  }

  private describe(
    exception: unknown,
    status: HttpStatus,
  ): { message: string; errors?: Record<string, string[]> } {
    if (!(exception instanceof HttpException)) {
      // Message volontairement générique : le détail d'une erreur interne ne doit
      // jamais renseigner un attaquant sur le fonctionnement du système.
      return {
        message:
          'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      };
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { message: payload };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record['message'];
    const rawErrors = record['errors'];

    const errors =
      typeof rawErrors === 'object' && rawErrors !== null
        ? (rawErrors as Record<string, string[]>)
        : undefined;

    if (typeof rawMessage === 'string') {
      return { message: rawMessage, errors };
    }

    // NestJS peut encore produire un tableau plat de messages, par exemple lorsqu'une
    // exception est levée manuellement sans passer par la fabrique de validation.
    if (Array.isArray(rawMessage)) {
      return { message: rawMessage.join(' '), errors };
    }

    return { message: defaultMessageFor(status), errors };
  }
}

function defaultMessageFor(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'Les données envoyées sont invalides.';
    case HttpStatus.UNAUTHORIZED:
      return 'Vous devez être connecté pour effectuer cette action.';
    case HttpStatus.FORBIDDEN:
      return "Vous n'avez pas accès à cette ressource.";
    case HttpStatus.NOT_FOUND:
      return 'La ressource demandée est introuvable.';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Trop de tentatives. Veuillez patienter avant de réessayer.';
    default:
      return 'La requête n’a pas pu être traitée.';
  }
}
