import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BeneficiariesService } from './beneficiaries.service';

@Controller('beneficiaries-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BeneficiariesHistoryController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  deliveredHistory(
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('aidCategoryId') aidCategoryId?: string,
    @Query('aidCategoryItemId') aidCategoryItemId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.beneficiaries.deliveredHistory({
      q: q?.trim() || search?.trim() || undefined,
      aidCategoryId,
      aidCategoryItemId,
      includeInactive,
      page,
      limit,
    });
  }
}
