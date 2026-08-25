import { IsIn } from 'class-validator';
import type { PaymentOutcome } from '../payment-driver';

/**
 * Corps de la simulation de règlement, réservée au prestataire factice et aux
 * environnements de développement (voir `PaymentsService.simulate`).
 */
export class SimulatePaymentDto {
  @IsIn(['successful', 'failed', 'cancelled'], {
    message: 'Issue de simulation inconnue.',
  })
  outcome!: PaymentOutcome;
}
