import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  HttpExceptionFilter,
  type ErrorResponseBody,
} from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import type { HealthReport } from './../src/modules/health/health.service';

describe('Socle de l’API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health répond que l’API et la base sont disponibles', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    const report = response.body as HealthReport;

    expect(report.status).toBe('ok');
    expect(report.database).toBe('up');
    expect(typeof report.uptime).toBe('number');
  });

  it('renvoie une erreur normalisée, sans trace, sur une route inconnue', async () => {
    const response = await request(app.getHttpServer())
      .get('/route-inexistante')
      .expect(404);

    const body = response.body as ErrorResponseBody;

    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/route-inexistante');
    // Aucune trace d'exception ne doit sortir dans une réponse HTTP (audit S-03).
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:\d+/);
  });
});
