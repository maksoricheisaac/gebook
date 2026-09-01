import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriverType } from '../../config/environment';
import { LocalStorageDriver } from './local-storage.driver';
import { PublicFilesController } from './public-files.controller';
import { R2StorageDriver } from './r2-storage.driver';
import { STORAGE_DRIVER, type StorageDriver } from './storage-driver';
import { UploadValidatorService } from './upload-validator.service';
import { VirusScanService } from './virus-scan.service';

/**
 * Le pilote actif se choisit par variable d'environnement
 * (`STORAGE_DRIVER=local|r2`), même principe que `PAYMENT_DRIVER`/
 * `PAYOUT_DRIVER` : un seul pilote actif à la fois, jamais un registre de
 * plusieurs, puisque le stockage n'est pas un choix par requête mais un
 * réglage de toute l'installation. `validateEnvironment()` refuse déjà de
 * démarrer si `STORAGE_DRIVER=r2` sans les identifiants — cette fabrique
 * peut donc supposer qu'ils sont présents quand ce cas se présente ici.
 */
function createStorageDriver(
  local: LocalStorageDriver,
  r2: R2StorageDriver,
  config: ConfigService,
): StorageDriver {
  return config.get<StorageDriverType>('STORAGE_DRIVER') ===
    StorageDriverType.r2
    ? r2
    : local;
}

@Module({
  controllers: [PublicFilesController],
  providers: [
    UploadValidatorService,
    VirusScanService,
    LocalStorageDriver,
    R2StorageDriver,
    {
      provide: STORAGE_DRIVER,
      useFactory: createStorageDriver,
      inject: [LocalStorageDriver, R2StorageDriver, ConfigService],
    },
  ],
  exports: [UploadValidatorService, VirusScanService, STORAGE_DRIVER],
})
export class FilesModule {}
