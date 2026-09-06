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
import { ResendLoginOtpDto } from './dto/resend-login-otp.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
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

/** Réponse d'inscription/connexion quand l'adresse e-mail reste à confirmer
 * (brief §1) — pas une erreur, un état d'attente distinct. */
export interface VerificationRequiredResponse {
  status: 'verification_required';
  email: string;
}

/** Réponse de connexion quand un code vient d'être envoyé par e-mail (audit
 * pré-production) — mot de passe et adresse déjà vérifiés, il ne manque que
 * le code pour obtenir une session. */
export interface OtpRequiredResponse {
  status: 'otp_required';
  email: string;
}

export type LoginResponse =
  | { status: 'ok'; user: AuthUserResponse }
  | VerificationRequiredResponse
  | OtpRequiredResponse;

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
  ): Promise<LoginResponse> {
    const outcome = await this.auth.register(dto, requestMeta(request));
    return this.applyOutcome(outcome, response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const outcome = await this.auth.login(dto, requestMeta(request));
    return this.applyOutcome(outcome, response);
  }

  /**
   * Consomme le lien reçu par e-mail : vérifie l'adresse et connecte
   * directement (brief §1). En `POST`, jamais `GET` — un lien cliqué depuis
   * un client mail est parfois pré-chargé automatiquement par un filtre
   * antispam, ce qui consommerait le jeton avant même que la personne ne
   * clique ; la page frontend soumet ce jeton explicitement.
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.verifyEmail(
      dto.token,
      requestMeta(request),
    );
    response.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return user;
  }

  /**
   * Renvoi manuel du lien, depuis la page « vérifiez votre boîte mail ».
   * Toujours `204`, que le compte existe ou non, ou soit déjà vérifié —
   * voir `AuthService.resendVerification()`.
   */
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.resendVerification(dto.email, requestMeta(request));
  }

  /**
   * Termine une connexion en attente de code (`POST /auth/login` →
   * `otp_required`) : seule cette route pose réellement le cookie de session
   * après une connexion par mot de passe.
   */
  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  async verifyLoginOtp(
    @Body() dto: VerifyLoginOtpDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.verifyLoginOtp(
      dto.email,
      dto.code,
      requestMeta(request),
    );
    response.cookie(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return user;
  }

  /**
   * Renvoi manuel du code, depuis la page « saisissez votre code ». Toujours
   * `204`, que le compte existe ou non — voir `AuthService.resendLoginOtp()`.
   */
  @Post('login/otp/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendLoginOtp(
    @Body() dto: ResendLoginOtpDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.resendLoginOtp(dto.email, requestMeta(request));
  }

  private applyOutcome(
    outcome: Awaited<ReturnType<AuthService['login']>>,
    response: Response,
  ): LoginResponse {
    if (
      outcome.status === 'verification_required' ||
      outcome.status === 'otp_required'
    ) {
      return outcome;
    }
    response.cookie(
      SESSION_COOKIE_NAME,
      outcome.session.token,
      sessionCookieOptions(outcome.session.expiresAt),
    );
    return { status: 'ok', user: outcome.user };
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
