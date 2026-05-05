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
    @Query('aidCategoryId') aidCategoryId?: string,
    @Query('aidCategoryItemId') aidCategoryItemId?: string,
  ) {
    return this.beneficiaries.deliveredHistory({
      q,
      aidCategoryId,
      aidCategoryItemId,
    });
  }
}
