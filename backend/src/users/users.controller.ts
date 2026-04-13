import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForceDeleteUserDto } from './dto/force-delete-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  list(@CurrentUser() actor: AuthUser, @Query('role') role?: RoleCode, @Query('q') q?: string) {
    return this.users.list(actor, { role, q });
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor.userId, dto);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor.userId, id, dto);
  }

  @Post(':id/reset-password')
  @Roles(RoleCode.SUPER_ADMIN)
  resetPassword(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(actor.userId, id, dto.password);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.remove(actor.userId, id);
  }

  @Post(':id/force-delete')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  forceDelete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ForceDeleteUserDto) {
    return this.users.forceRemove(actor, id, dto.confirmationText, dto.selfUsernameConfirm, dto.reason);
  }
}
