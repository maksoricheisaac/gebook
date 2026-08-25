import { Module } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminAuthorsController } from './admin/admin-authors.controller';
import { AdminAuthorsService } from './admin/admin-authors.service';
import { AdminCategoriesController } from './admin/admin-categories.controller';
import { AdminCategoriesService } from './admin/admin-categories.service';
import { AdminWorksController } from './admin/admin-works.controller';
import { AdminWorksService } from './admin/admin-works.service';
import { AuthorsService } from './authors.service';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { WorksService } from './works.service';

/**
 * Auteurs, catégories, œuvres et formats dans un seul module : ces entités se lisent
 * et s'éditent ensemble. Quatre modules séparés produiraient des imports croisés
 * permanents sans rien apporter.
 *
 * Les contrôleurs `admin/*` partagent le module : ce sont les mêmes entités, avec
 * des routes et des guards différents, pas un domaine différent (audit §28).
 */
@Module({
  imports: [AuthModule, FilesModule, TenantsModule],
  controllers: [
    CatalogController,
    AdminCategoriesController,
    AdminAuthorsController,
    AdminWorksController,
  ],
  providers: [
    WorksService,
    AuthorsService,
    CategoriesService,
    AdminCategoriesService,
    AdminAuthorsService,
    AdminWorksService,
    ActivityLogService,
  ],
})
export class CatalogModule {}
