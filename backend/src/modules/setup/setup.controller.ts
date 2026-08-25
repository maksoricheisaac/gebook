import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { requestMeta } from '../auth/auth.controller';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/session-cookie';
import type { AuthUserResponse } from '../auth/dto/auth-user.response';
import { CreateSuperadminDto } from './dto/create-superadmin.dto';
import { SetupService, type SetupStatus } from './setup.service';

/**
 * Assistant de configuration initiale, séparé du contrôleur `auth` : cette route
 * n'a de sens qu'une seule fois dans la vie d'un déploiement, et ne partage pas
 * la mécanique d'inscription publique (`AuthService.register()` attribue
 * toujours `reader`, jamais un rôle plateforme).
 */
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  /** Public et sans jeton : dit seulement si l'assistant est encore ouvert. */
  @Get('status')
  status(): Promise<SetupStatus> {
    return this.setup.status();
  }

  @Post('superadmin')
  @HttpCode(HttpStatus.CREATED)
  async createSuperadmin(
    @Body() dto: CreateSuperadminDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.setup.createSuperadmin(
      dto,
      requestMeta(request),
    );
    response.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return user;
  }
}
