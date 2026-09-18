import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NodeEnvironment, validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { ContactModule } from './modules/contact/contact.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { LibraryModule } from './modules/library/library.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { SetupModule } from './modules/setup/setup.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Un fichier par environnement, avec `.env` comme base commune. Le premier
      // fichier trouvé l'emporte, ce qui permet de surcharger sans dupliquer.
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: validateEnvironment,
    }),
    // Garde-fou générique (100 req/min par IP) : `LoginThrottleService` reste
    // l'autorité métier sur register/login/OTP (5/15min), plus stricte. Le
    // gain net de ce garde global est de couvrir les routes qui n'ont aucune
    // protection dédiée aujourd'hui — `POST /contact` en tête.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    SetupModule,
    FilesModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    PayoutsModule,
    LibraryModule,
    CommissionsModule,
    SettingsModule,
    TenantsModule,
    SystemModule,
    ContactModule,
    ActivityLogModule,
  ],
  providers: [
    // Jamais enregistré en `NODE_ENV=test` : la suite e2e enchaîne des
    // dizaines de requêtes rapprochées par fichier (même précédent que
    // `LoginThrottleService`, qui saute déjà sa propre limite en test) — un
    // garde global actif y produirait des 429 sans rapport avec ce qui est
    // testé.
    ...(process.env.NODE_ENV === NodeEnvironment.test
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
  ],
})
export class AppModule {}
