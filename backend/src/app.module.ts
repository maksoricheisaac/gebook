import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { LibraryModule } from './modules/library/library.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SetupModule } from './modules/setup/setup.module';
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
    PrismaModule,
    HealthModule,
    AuthModule,
    SetupModule,
    FilesModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    LibraryModule,
    CommissionsModule,
    TenantsModule,
    SystemModule,
  ],
})
export class AppModule {}
