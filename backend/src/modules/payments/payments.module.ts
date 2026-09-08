import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { AuthModule } from '../auth/auth.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentProvidersService } from './admin-payment-providers.service';
import { AdminPaymentsController } from './admin-payments.controller';
import { CinetPayPaymentDriver } from './drivers/cinetpay-payment.driver';
import { FakePaymentDriver } from './drivers/fake-payment.driver';
import { FakePayoutDriver } from './drivers/fake-payout.driver';
import { FeexPayPaymentDriver } from './drivers/feexpay-payment.driver';
import { FeexPayPayoutDriver } from './drivers/feexpay-payout.driver';
import { PawaPayPaymentDriver } from './drivers/pawapay-payment.driver';
import { PawaPayPayoutDriver } from './drivers/pawapay-payout.driver';
import { PAYMENT_DRIVER } from './payment-driver';
import { PaymentDriverRegistry } from './payment-driver.registry';
import { PAYOUT_DRIVER } from './payout-driver';
import { PayoutDriverRegistry } from './payout-driver.registry';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ProviderConfigService } from './provider-config.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Ajouter un prestataire consiste à écrire un pilote, puis à l'ajouter aux
 * `providers` et à la liste enregistrée sous `PAYMENT_DRIVER`/`PAYOUT_DRIVER`.
 * Aucun autre fichier ne change : ni le service, ni les contrôleurs, ni le
 * frontend (règle n° 22). Les deux registres sont indépendants (brief §1) :
 * un pilote peut n'exister que côté pay-in, que côté payout, ou des deux.
 */
@Module({
  imports: [AuthModule, CommissionsModule, CryptoModule],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    AdminPaymentProvidersController,
    WebhooksController,
  ],
  providers: [
    PaymentsService,
    PaymentDriverRegistry,
    PayoutDriverRegistry,
    AdminPaymentProvidersService,
    ProviderConfigService,
    ActivityLogService,
    FakePaymentDriver,
    FakePayoutDriver,
    CinetPayPaymentDriver,
    FeexPayPaymentDriver,
    FeexPayPayoutDriver,
    PawaPayPaymentDriver,
    PawaPayPayoutDriver,
    {
      provide: PAYMENT_DRIVER,
      useFactory: (
        fake: FakePaymentDriver,
        cinetpay: CinetPayPaymentDriver,
        feexpay: FeexPayPaymentDriver,
        pawapay: PawaPayPaymentDriver,
      ) => [fake, cinetpay, feexpay, pawapay],
      inject: [
        FakePaymentDriver,
        CinetPayPaymentDriver,
        FeexPayPaymentDriver,
        PawaPayPaymentDriver,
      ],
    },
    {
      provide: PAYOUT_DRIVER,
      useFactory: (
        fake: FakePayoutDriver,
        feexpay: FeexPayPayoutDriver,
        pawapay: PawaPayPayoutDriver,
      ) => [fake, feexpay, pawapay],
      inject: [FakePayoutDriver, FeexPayPayoutDriver, PawaPayPayoutDriver],
    },
  ],
  exports: [PayoutDriverRegistry, ProviderConfigService],
})
export class PaymentsModule {}
