import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { contentDispositionAttachment } from '../common/csv';
import { PurchaseNeedsService } from './purchase-needs.service';

@Controller('reports/purchase-needs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
export class PurchaseNeedsController {
  constructor(private readonly purchaseNeeds: PurchaseNeedsService) {}

  @Get()
  getPurchaseNeeds(
    @CurrentUser() actor: AuthUser,
    @Query('aidCategoryId') aidCategoryId?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ) {
    return this.purchaseNeeds.getPurchaseNeeds(actor, {
      aidCategoryId,
      search: search?.trim() || q?.trim() || undefined,
      includeInactive,
      sortBy,
      sortDirection,
    });
  }

  @Get('export')
  async exportPurchaseNeedsCsv(
    @CurrentUser() actor: AuthUser,
    @Query('aidCategoryId') aidCategoryId?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ): Promise<StreamableFile> {
    const { csv, filename } = await this.purchaseNeeds.exportPurchaseNeedsCsv(
      actor,
      {
        aidCategoryId,
        search: search?.trim() || q?.trim() || undefined,
        includeInactive,
        sortBy,
        sortDirection,
      },
    );
    const body = Buffer.from(`\uFEFF${csv}`, 'utf8');
    return new StreamableFile(body, {
      type: 'text/csv; charset=utf-8',
      disposition: contentDispositionAttachment(filename),
    });
  }
}
