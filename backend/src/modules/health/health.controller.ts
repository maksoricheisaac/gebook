import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Sonde de disponibilité. Répond toujours 200 lorsque le processus est vivant :
   * l'état de la base est décrit dans le corps, ce qui permet à une supervision de
   * distinguer « API éteinte » de « API debout, base injoignable ».
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
