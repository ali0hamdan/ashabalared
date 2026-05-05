import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { ForceDeleteDto } from '../common/dto/force-delete.dto';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryItemDto } from './dto/create-category-item.dto';
import { UpdateCategoryItemDto } from './dto/update-category-item.dto';

@Controller('aid-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  list(@Query('includeInactive') includeInactive?: string) {
    return this.categories.list(
      includeInactive === '1' || includeInactive === 'true',
    );
  }

  /** Beneficiaries with item-level or legacy category-level need for this aid category (lightweight). */
  @Get(':id/beneficiaries')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  beneficiariesNeedingCategory(
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.categories.beneficiariesNeedingCategory(id, q);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(actor.userId, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(actor.userId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.categories.remove(actor, id);
  }

  @Post(':id/force-delete')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  forceDelete(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ForceDeleteDto,
  ) {
    return this.categories.forceDelete(
      actor,
      id,
      dto.confirmationText,
      dto.reason,
    );
  }

  @Post(':id/items')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  addItem(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCategoryItemDto,
  ) {
    return this.categories.addItem(actor.userId, id, dto);
  }

  @Patch('items/:itemId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  updateItem(
    @CurrentUser() actor: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCategoryItemDto,
  ) {
    return this.categories.updateItem(actor.userId, itemId, dto);
  }

  @Delete('items/:itemId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  removeItem(@CurrentUser() actor: AuthUser, @Param('itemId') itemId: string) {
    return this.categories.removeItem(actor.userId, itemId);
  }
}
