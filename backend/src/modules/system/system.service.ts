import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(private readonly prisma: PrismaService) {}

  async wipePlatform(currentUserId: string): Promise<void> {
    this.logger.warn(`Wipe platform requested by superadmin ${currentUserId}`);

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Suppression des entités dépendantes en respectant les clés étrangères
        await tx.download.deleteMany();
        await tx.readerLibrary.deleteMany();
        await tx.saleDistribution.deleteMany();
        await tx.orderItem.deleteMany();
        await tx.paymentEvent.deleteMany();
        await tx.payment.deleteMany();
        await tx.payoutEvent.deleteMany();
        await tx.payout.deleteMany();
        await tx.order.deleteMany();
        await tx.workFile.deleteMany();
        await tx.providerProduct.deleteMany();
        await tx.workFormat.deleteMany();
        await tx.workTranslation.deleteMany();
        await tx.work.deleteMany();
        await tx.authorTranslation.deleteMany();
        await tx.author.deleteMany();
        await tx.categoryTranslation.deleteMany();
        await tx.category.deleteMany();
        await tx.commissionRule.deleteMany();
        await tx.tenantSetting.deleteMany();
        await tx.tenantMember.deleteMany();
        await tx.tenantTermsAcceptance.deleteMany();
        await tx.tenant.deleteMany();

        // 2. Suppression des utilisateurs (SAUF l'admin courant) - cascade sur sessions, etc.
        await tx.session.deleteMany({
          where: { user: { id: { not: currentUserId } } },
        });
        await tx.userRole.deleteMany({
          where: { user: { id: { not: currentUserId } } },
        });
        await tx.user.deleteMany({
          where: { id: { not: currentUserId } },
        });

        // 3. Nettoyage des historiques
        if ('activityLog' in tx) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
          await (tx as any).activityLog.deleteMany({
            where: { action: { not: 'auth.setup.superadmin_created' } },
          });
        }
        if ('loginAttempt' in tx) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
          await (tx as any).loginAttempt.deleteMany();
        }
      },
      {
        timeout: 60000,
      },
    );

    this.logger.warn('Platform wiped successfully.');
  }
}
