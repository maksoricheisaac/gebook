import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LocalStorageDriver } from './local-storage.driver';
import { STORAGE_DRIVER } from './storage-driver';
import { UploadValidatorService } from './upload-validator.service';

@Module({
  imports: [
    // Couvertures et photos d'auteur : servies telles quelles. Les fichiers
    // privés (`storage/private`) ne sont volontairement raccordés à aucune
    // route statique — c'est ce qui garantit la règle métier n° 19.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'storage', 'public'),
      serveRoot: '/public',
    }),
  ],
  providers: [
    UploadValidatorService,
    { provide: STORAGE_DRIVER, useClass: LocalStorageDriver },
  ],
  exports: [UploadValidatorService, STORAGE_DRIVER],
})
export class FilesModule {}
