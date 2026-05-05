import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { RegionsService } from './regions.service';

@Controller('regions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.DELIVERY)
  list() {
    return this.regions.list();
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN)
  create(
    @CurrentUser() actor: AuthUser,
    @Body() body: { nameAr: string; nameEn?: string; sortOrder?: number },
  ) {
    return this.regions.create(actor.userId, body);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { nameAr?: string; nameEn?: string; sortOrder?: number },
  ) {
    return this.regions.update(actor.userId, id, body);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.regions.remove(actor.userId, id);
  }
}
