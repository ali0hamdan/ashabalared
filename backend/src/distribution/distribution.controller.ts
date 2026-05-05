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

import { DistributionService } from './distribution.service';

import { CreateDistributionDto } from './dto/create-distribution.dto';

import { DeliverDistributionDto } from './dto/deliver-distribution.dto';

import { AssignDriverDto } from './dto/assign-driver.dto';

import { ForceDeleteDto } from '../common/dto/force-delete.dto';

@Controller('distributions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  list(
    @CurrentUser() actor: AuthUser,

    @Query('status') status?: string,

    @Query('q') q?: string,
  ) {
    return this.distribution.list(actor, { status, q });
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
