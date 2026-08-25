import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { FakePaymentDriver } from './drivers/fake-payment.driver';
import { PAYMENT_DRIVER } from './payment-driver';
import { PaymentDriverRegistry } from './payment-driver.registry';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Ajouter un prestataire consiste à écrire un pilote, puis à l'ajouter aux
 * `providers` et à la liste enregistrée sous `PAYMENT_DRIVER`. Aucun autre fichier
 * ne change : ni le service, ni les contrôleurs, ni le frontend (règle n° 22).
 */
@Module({
  imports: [AuthModule, CommissionsModule],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    WebhooksController,
  ],
  providers: [
    PaymentsService,
    PaymentDriverRegistry,
    ActivityLogService,
    FakePaymentDriver,
    {
      provide: PAYMENT_DRIVER,
      useFactory: (fake: FakePaymentDriver) => [fake],
      inject: [FakePaymentDriver],
    },
  ],
})
export class PaymentsModule {}
