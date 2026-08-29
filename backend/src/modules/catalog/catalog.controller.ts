import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthorsService } from './authors.service';
import { CategoriesService } from './categories.service';
import { WorksService } from './works.service';
import { ListAuthorsQuery } from './dto/list-authors.query';
import { ListWorksQuery } from './dto/list-works.query';
import { LocaleQuery } from './dto/locale.query';
import type {
  AuthorDetailResponse,
  AuthorSummaryResponse,
  CategoryResponse,
  PaginatedResponse,
  WorkDetailResponse,
  WorkSummaryResponse,
} from './dto/catalog.response';

/*
 * Lecture publique du catalogue.
 *
 * Les URL de l'API sont en anglais, celles du site restent en français : Next.js
 * sert `/livres/{slug}` et appelle `/works/:slug`. La frontière est nette et
 * volontaire — le référencement d'un côté, la convention de code de l'autre.
 *
 * Les trois ressources partagent un contrôleur parce qu'elles se lisent ensemble et
 * n'ont aucune logique propre à isoler. Le jour où l'écriture arrivera, elle vivra
 * dans un contrôleur d'administration distinct, avec ses guards.
 */
@Controller()
export class CatalogController {
  constructor(
    private readonly works: WorksService,
    private readonly authors: AuthorsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get('works')
  listWorks(
    @Query() query: ListWorksQuery,
  ): Promise<PaginatedResponse<WorkSummaryResponse>> {
    return this.works.list(query);
  }

  @Get('works/:slug')
  findWork(
    @Param('slug') slug: string,
    @Query() query: LocaleQuery,
  ): Promise<WorkDetailResponse> {
    return this.works.findBySlug(slug, query.locale);
  }

  @Get('authors')
  listAuthors(
    @Query() query: ListAuthorsQuery,
  ): Promise<AuthorSummaryResponse[]> {
    return this.authors.list(query.locale, query.tenant);
  }

  @Get('authors/:slug')
  findAuthor(
    @Param('slug') slug: string,
    @Query() query: LocaleQuery,
  ): Promise<AuthorDetailResponse> {
    return this.authors.findBySlug(slug, query.locale);
  }

  @Get('categories')
  listCategories(@Query() query: LocaleQuery): Promise<CategoryResponse[]> {
    return this.categories.list(query.locale);
  }
}
