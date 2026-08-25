import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { OriginGuard } from './guards/origin.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginThrottleService } from './login-throttle.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    LoginThrottleService,
    AuthGuard,
    RolesGuard,
    // Global : toute méthode d'écriture, présente ou future, est vérifiée sans
    // wiring supplémentaire (voir le commentaire d'`OriginGuard`).
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
  exports: [AuthGuard, RolesGuard, SessionService, LoginThrottleService],
})
export class AuthModule {}
