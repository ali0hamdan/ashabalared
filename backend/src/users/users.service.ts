import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, PrismaClient, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { deleteBlocked } from '../common/http/delete-blocked';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async roleId(code: RoleCode) {
    const r = await this.prisma.role.findUnique({ where: { code } });
    if (!r) throw new BadRequestException('Role missing — run seed');
    return r.id;
  }

  private async assertUserDeletable(id: string) {
    const dist = await this.prisma.distributionRecord.count({
      where: {
        OR: [{ createdById: id }, { driverId: id }, { completedById: id }],
      },
    });
    if (dist > 0) {
      throw deleteBlocked(
        'This user is referenced by distribution records.',
        ['distributions'],
        { distributionRefs: dist },
      );
    }
    const assigns = await this.prisma.deliveryAssignment.count({
      where: { deliveryUserId: id },
    });
    if (assigns > 0) {
      throw deleteBlocked(
        'This user is referenced by delivery assignments.',
        ['deliveryAssignments'],
        { assignmentRefs: assigns },
      );
    }
  }

  /**
   * Clears nullable FKs to this user. When `reassignToUserId` is set, required FKs on
   * DistributionRecord (createdBy) and DeliveryAssignment (deliveryUser) are moved to that user first.
   */
  private async detachUserReferences(
    id: string,
    opts?: { reassignToUserId?: string },
    tx: PrismaClient | Prisma.TransactionClient = this.prisma,
  ) {
    const db = tx;
    const reassign = opts?.reassignToUserId;
    if (reassign && reassign !== id) {
      await db.distributionRecord.updateMany({
        where: { createdById: id },
        data: { createdById: reassign },
      });
      await db.deliveryAssignment.updateMany({
        where: { deliveryUserId: id },
        data: { deliveryUserId: reassign },
      });
    }
    await db.distributionRecord.updateMany({
      where: { driverId: id },
      data: { driverId: null },
    });
    await db.distributionRecord.updateMany({
      where: { completedById: id },
      data: { completedById: null },
    });
    await db.deliveryAssignment.updateMany({
      where: { assignedById: id },
      data: { assignedById: null },
    });

    await db.auditLog.updateMany({
      where: { actorUserId: id },
      data: { actorUserId: null },
    });
    await db.stockMovement.updateMany({
      where: { createdById: id },
      data: { createdById: null },
    });
    await db.user.updateMany({
      where: { createdById: id },
      data: { createdById: null },
    });
  }

  private isForeignKeyViolation(e: unknown): boolean {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return e.code === 'P2003' || e.code === 'P2014';
    }
    const msg = e instanceof Error ? e.message : String(e);
    return /foreign key|violates foreign key|23001|P2003|P2014/i.test(msg);
  }

  /** When force-deleting self, reassign refs to another active user (cannot point at the row being removed). */
  private async resolveReassignTargetForForceDelete(
    actorId: string,
    userIdToDelete: string,
  ): Promise<string> {
    if (actorId !== userIdToDelete) return actorId;
    const other = await this.prisma.user.findFirst({
      where: { id: { not: userIdToDelete }, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!other) {
      throw new BadRequestException(
        'Cannot delete the only remaining user; there is no account to reassign records to.',
      );
    }
    return other.id;
  }

  async list(
    actor: { userId: string; roleCode: RoleCode },
    query: { role?: RoleCode; q?: string },
  ) {
    const where: Prisma.UserWhereInput = {};
    if (actor.roleCode === RoleCode.ADMIN) {
      where.role = { code: RoleCode.DELIVERY };
    } else if (query.role) {
      where.role = { code: query.role };
    }
    if (query.q) {
      where.OR = [
        { username: { contains: query.q, mode: 'insensitive' } },
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { role: true, region: true },
    });
  }

  async create(actorId: string, dto: CreateUserDto) {
    if (dto.roleCode === RoleCode.SUPER_ADMIN)
      throw new BadRequestException('غير مسموح');
    const username = dto.username.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new BadRequestException('اسم المستخدم موجود');
    const roleId = await this.roleId(dto.roleCode);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        displayName: dto.displayName,
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone,
        passwordHash,
        roleId,
        regionId: dto.regionId,
        mustChangePassword: dto.mustChangePassword ?? true,
        createdById: actorId,
      },
      include: { role: true, region: true },
    });
    await this.audit.log({
      action: 'USER_CREATED',
      actorUserId: actorId,
      entityType: 'USER',
      entityId: user.id,
      details: { username: user.username, roleCode: user.role.code },
    });
    return user;
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException();
    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.email !== undefined)
      data.email = dto.email ? dto.email.trim().toLowerCase() : null;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.regionId !== undefined)
      data.region = dto.regionId
        ? { connect: { id: dto.regionId } }
        : { disconnect: true };
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { role: true, region: true },
    });
    await this.audit.log({
      action: 'USER_UPDATED',
      actorUserId: actorId,
      entityType: 'USER',
      entityId: id,
      details: dto as object,
    });
    return updated;
  }

  async resetPassword(actorId: string, id: string, password?: string) {
    const pwd = password ?? randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(pwd, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    await this.audit.log({
      action: 'PASSWORD_RESET',
      actorUserId: actorId,
      entityType: 'USER',
      entityId: id,
    });
    return { temporaryPassword: pwd };
  }

  async remove(actorId: string, id: string) {
    if (id === actorId) {
      throw deleteBlocked(
        'You cannot delete your own account with a normal delete.',
        ['selfAccount'],
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException();
    if (user.role.code === RoleCode.SUPER_ADMIN) {
      throw deleteBlocked(
        'Super-admin accounts require a force-delete override.',
        ['superAdminAccount'],
      );
    }
    await this.assertUserDeletable(id);
    await this.detachUserReferences(id);
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({
      action: 'USER_DELETED',
      actorUserId: actorId,
      entityType: 'USER',
      entityId: id,
      details: { username: user.username },
    });
    return { ok: true };
  }

  async forceRemove(
    actor: AuthUser,
    id: string,
    confirmationText: string,
    selfUsernameConfirm?: string,
    reason?: string,
  ) {
    if (
      actor.roleCode !== RoleCode.SUPER_ADMIN &&
      actor.roleCode !== RoleCode.ADMIN
    ) {
      throw new ForbiddenException();
    }
    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException(
        'Confirmation must be the word DELETE (exact match).',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException();
    if (
      user.role.code === RoleCode.SUPER_ADMIN &&
      actor.roleCode !== RoleCode.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }
    if (id === actor.userId) {
      const ok =
        (selfUsernameConfirm ?? '').trim().toLowerCase() ===
        actor.username.trim().toLowerCase();
      if (!ok) {
        throw new BadRequestException(
          'To delete your own account, provide selfUsernameConfirm matching your username exactly.',
        );
      }
    }
    const reassignTo = await this.resolveReassignTargetForForceDelete(
      actor.userId,
      id,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.detachUserReferences(
          id,
          { reassignToUserId: reassignTo },
          tx,
        );
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
      });
    } catch (e) {
      if (this.isForeignKeyViolation(e)) {
        throw deleteBlocked(
          'This user is still referenced by protected records after reassignment. If this persists, contact support.',
          ['databaseReferences'],
        );
      }
      throw e;
    }
    await this.audit.log({
      action: 'USER_FORCE_DELETED',
      actorUserId: actor.userId,
      entityType: 'USER',
      entityId: id,
      details: {
        actorRole: actor.roleCode,
        deletedUsername: user.username,
        deletedRoleCode: user.role.code,
        reason: reason ?? null,
        confirmationText: 'DELETE',
        selfDelete: id === actor.userId,
      },
    });
    return { ok: true };
  }
}
