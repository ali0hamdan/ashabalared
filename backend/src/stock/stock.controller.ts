import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { ForceDeleteDto } from '../common/dto/force-delete.dto';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  list(
    @Query('categoryId') categoryId?: string,
    @Query('lowOnly') lowOnly?: string,
    @Query('hasAvailable') hasAvailable?: string,
    @Query('q') q?: string,
  ) {
    return this.stock.list({
      categoryId,
      lowOnly: lowOnly === '1' || lowOnly === 'true',
      hasAvailable: hasAvailable === '1' || hasAvailable === 'true',
      q,
    });
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() body: CreateStockItemDto) {
    return this.stock.create(actor.userId, body);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: UpdateStockItemDto) {
    return this.stock.update(actor.userId, id, body);
  }

  @Patch(':id/adjust')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  adjust(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { delta: number; note?: string }) {
    return this.stock.adjust(actor.userId, id, body);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.stock.remove(actor.userId, id);
  }

  @Post(':id/force-delete')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  forceDelete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ForceDeleteDto) {
    return this.stock.forceDelete(actor, id, dto.confirmationText, dto.reason);
  }

  @Get(':id/movements')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  movements(@Param('id') id: string) {
    return this.stock.movements(id);
  }
}
