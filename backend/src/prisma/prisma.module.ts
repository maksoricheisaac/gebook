import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Module global : tous les modules métier ont besoin de la base, et une seule
 * connexion doit exister. Les déclarer un par un dans chaque `imports` n'apporterait
 * rien d'autre que du bruit.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
