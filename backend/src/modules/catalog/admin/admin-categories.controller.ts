import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Category } from '../../../generated/prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import {
  AdminCategoriesService,
  type AdminCategoryStats,
} from './admin-categories.service';
import {
  AdminListQuery,
  type AdminPaginatedResponse,
} from './dto/admin-list.query';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/** Gestion des catégories — lecture et écriture réservées aux administrateurs. */
@Controller('admin/categories')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  list(
    @Query() query: AdminListQuery,
  ): Promise<AdminPaginatedResponse<Category>> {
    return this.categories.list(query);
  }

  @Get('stats')
  stats(): Promise<AdminCategoryStats> {
    return this.categories.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categories.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<Category> {
    return this.categories.create(dto, admin.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<Category> {
    return this.categories.update(id, dto, admin.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<void> {
    return this.categories.remove(id, admin.id);
  }
}
