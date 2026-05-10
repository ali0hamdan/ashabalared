import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ForceDeleteDto } from '../common/dto/force-delete.dto';
import { Response } from 'express';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Controller('beneficiaries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  list(
    @Query('q') q?: string,
    /** Same as `q` (either may be used). */
    @Query('search') search?: string,
    /** Raw query string — validated in BeneficiariesService (invalid values → 400, not 500). */
    @Query('status') status?: string,
    @Query('regionId') regionId?: string,
    /** When true: only ACTIVE beneficiaries unless `includeInactive` is true (operational pickers). */
    @Query('forSelection') forSelection?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const qCombined = (q?.trim() || search?.trim() || undefined) as
      | string
      | undefined;
    return this.beneficiaries.list({
      q: qCombined,
      status,
      regionId,
      forSelection,
      includeInactive,
      activeOnly,
      page,
      limit,
    });
  }

  @Get('export/csv')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Header('Content-Disposition', 'attachment; filename="beneficiaries.csv"')
  async exportCsv(@Res() res: Response) {
    const csv = await this.beneficiaries.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(`\uFEFF${csv}`);
  }

  /** Duplicate detection for create/edit forms. Must be registered before `@Get(':id')`. */
  @Get('duplicate-check')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  duplicateCheck(
    @Query('fullName') fullName?: string,
    @Query('phone') phone?: string,
    @Query('area') area?: string,
    @Query('street') street?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.beneficiaries.duplicateCheck({
      fullName,
      phone,
      area,
      street,
      excludeId,
    });
  }

  /** Category + item needs only (lightweight; distribution UI). Must be registered before `@Get(':id')`. */
  @Get(':id/needs')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  needsSummary(@Param('id') id: string) {
    return this.beneficiaries.getNeedsSummary(id);
  }

  /** Delivered aid per category in the last N days (for distribution duplicate warnings). Must be registered before `@Get(':id')`. */
  @Get(':id/recent-aid')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  recentAid(
    @Param('id') id: string,
    @Query('days') days?: string,
    @Query('categoryIds') categoryIds?: string,
  ) {
    return this.beneficiaries.getRecentAid(id, { days, categoryIds });
  }

  @Get(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  get(@Param('id') id: string) {
    return this.beneficiaries.get(id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBeneficiaryDto) {
    return this.beneficiaries.create(actor.userId, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiaries.update(actor.userId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  archive(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.beneficiaries.archive(actor.userId, id);
  }

  @Post(':id/force-archive')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  forceArchive(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ForceDeleteDto,
  ) {
    return this.beneficiaries.forceArchive(
      actor,
      id,
      dto.confirmationText,
      dto.reason,
    );
  }
}
