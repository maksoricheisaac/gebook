import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkipOriginCheck } from '../auth/decorators/skip-origin-check.decorator';
import { PaymentsService } from './payments.service';

/**
 * Point d'entrée des notifications de paiement.
 *
 * Ni `AuthGuard` ni vérification d'origine : un prestataire n'a ni session ni
 * navigateur. La seule authentification recevable est la signature du message,
 * vérifiée par le pilote sur le corps **brut** — c'est pourquoi ce contrôleur lit
 * `request.rawBody` et non un corps déjà analysé puis réassemblé (audit §33).
 */
@Controller('webhooks')
@SkipOriginCheck()
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':providerCode')
  // 200 et non 201 : un prestataire attend un accusé de réception, pas une
  // création. Une réponse lente ou inattendue déclenche des réessais.
  @HttpCode(HttpStatus.OK)
  handle(
    @Param('providerCode') providerCode: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Notification de paiement vide.');
    }

    return this.payments.handleWebhook(providerCode, rawBody, request.headers);
  }
}
