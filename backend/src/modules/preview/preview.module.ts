import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { SettingsModule } from '../settings/settings.module';
import { PdfRasterizerService } from './pdf-rasterizer.service';
import { PreviewController } from './preview.controller';
import { PreviewGenerationService } from './preview-generation.service';
import { PreviewPolicyService } from './preview-policy.service';
import { PreviewService } from './preview.service';

@Module({
  imports: [AuthModule, FilesModule, SettingsModule],
  controllers: [PreviewController],
  providers: [
    PreviewService,
    PreviewPolicyService,
    PreviewGenerationService,
    PdfRasterizerService,
  ],
  // `PreviewGenerationService` : déclenchée depuis `AdminWorksService` juste
  // après l'upload du fichier complet — voir `CatalogModule`.
  exports: [PreviewGenerationService],
})
export class PreviewModule {}
