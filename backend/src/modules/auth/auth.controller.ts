import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  toAuthUserResponse,
  type AuthUserResponse,
} from './dto/auth-user.response';
import { AuthGuard } from './guards/auth.guard';
import {
  clearedSessionCookieOptions,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session-cookie';
import type { AuthenticatedUser, RequestMeta } from './auth.types';

/**
 * Authentification publique.
 *
 * Regroupée dans un seul contrôleur : inscription, connexion, déconnexion et lecture
 * de l'utilisateur courant se lisent ensemble et partagent la même mécanique de
 * cookie. L'administration des comptes (blocage, changement de rôle) vivra dans un
 * contrôleur d'administration séparé, avec ses propres guards.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.register(
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.login(dto, requestMeta(request));
    response.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request & { user?: AuthenticatedUser },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];

    // Idempotent : appeler `/auth/logout` sans session valide ne doit pas échouer,
    // seulement ne rien avoir à faire. Le cookie est effacé dans tous les cas.
    if (token) {
      await this.auth.logout(token, null, requestMeta(request));
    }

    response.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthUserResponse {
    return toAuthUserResponse(user);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AuthUserResponse> {
    return this.auth.updateProfile(user.id, dto, requestMeta(request));
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    // `AuthGuard` a déjà résolu `user` depuis ce même cookie : il est donc
    // forcément présent ici, mais on ne suppose jamais un type que
    // l'assertion du guard ne garantit pas formellement.
    if (!token) {
      throw new UnauthorizedException('Session invalide.');
    }
    await this.auth.changePassword(user, dto, token, requestMeta(request));
  }
}

export function requestMeta(request: Request): RequestMeta {
  return {
    ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
    userAgent: request.headers['user-agent'],
  };
}
