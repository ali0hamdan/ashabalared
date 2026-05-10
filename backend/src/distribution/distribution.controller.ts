import {
  BadRequestException,
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

import { DistributionService } from './distribution.service';

import { CreateDistributionDto } from './dto/create-distribution.dto';

import { DeliverDistributionDto } from './dto/deliver-distribution.dto';

import { AssignDriverDto } from './dto/assign-driver.dto';

import { ForceDeleteDto } from '../common/dto/force-delete.dto';

function parseDayBoundary(iso: string | undefined, end: boolean): Date | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  if (end) dt.setHours(23, 59, 59, 999);
  else dt.setHours(0, 0, 0, 0);
  return dt;
}

function defaultWeeklyDateRange(): { dateFrom: Date; dateTo: Date } {
  const dateTo = new Date();
  dateTo.setHours(23, 59, 59, 999);
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - 7);
  dateFrom.setHours(0, 0, 0, 0);
  return { dateFrom, dateTo };
}

@Controller('distributions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Get('weekly-tracking')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  weeklyTracking(
    @CurrentUser() actor: AuthUser,
    @Query('aidCategoryId') aidCategoryId?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('driverId') driverId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const defaults = defaultWeeklyDateRange();
    const from = parseDayBoundary(dateFrom, false) ?? defaults.dateFrom;
    const to = parseDayBoundary(dateTo, true) ?? defaults.dateTo;
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }
    return this.distribution.weeklyTracking(actor, {
      aidCategoryId,
      search: search?.trim() || q?.trim() || undefined,
      statusFilter: status,
      dateFrom: from,
      dateTo: to,
      driverId: driverId?.trim() || undefined,
      page,
      limit,
    });
  }

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  list(
    @CurrentUser() actor: AuthUser,

    @Query('status') status?: string,

    @Query('q') q?: string,

    @Query('search') search?: string,

    @Query('page') page?: string,

    @Query('limit') limit?: string,
  ) {
    return this.distribution.list(actor, { status, q, search, page, limit });
  }

  @Get(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  get(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.distribution.get(actor, id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateDistributionDto) {
    return this.distribution.create(actor.userId, dto);
  }

  @Patch(':id/assign-driver')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  assignDriverPatch(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.distribution.assignDriver(actor.userId, id, dto.driverId);
  }

  @Post(':id/assign-driver')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  assignDriverPost(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.distribution.assignDriver(actor.userId, id, dto.driverId);
  }

  @Patch(':id/confirm-delivery')
  @Roles(RoleCode.DELIVERY)
  confirmDelivery(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeliverDistributionDto,
  ) {
    return this.distribution.confirmDelivery(actor.userId, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  cancel(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.distribution.cancel(actor.userId, id);
  }

  @Post(':id/force-delete')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  forceDelete(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ForceDeleteDto,
  ) {
    return this.distribution.forceRemove(
      actor,
      id,
      dto.confirmationText,
      dto.reason,
    );
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.distribution.remove(actor.userId, id);
  }
}
