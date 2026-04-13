import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode, StockUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateCategoryItemDto } from './dto/create-category-item.dto';
import { UpdateCategoryItemDto } from './dto/update-category-item.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive?: boolean) {
    return this.prisma.aidCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async create(actorId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.aidCategory.findUnique({ where: { name } });
    if (dup) throw new ConflictException('اسم الفئة مستخدم مسبقاً');
    const cat = await this.prisma.aidCategory.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        items: dto.items?.length
          ? {
              create: dto.items.map((it, i) => ({
                name: it.name.trim(),
                defaultQuantity: it.defaultQuantity ?? 1,
                unit: it.unit ?? StockUnit.PIECE,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { items: true },
    });
    await this.audit.log({
      action: 'CATEGORY_CREATED',
      actorUserId: actorId,
      entityType: 'AID_CATEGORY',
      entityId: cat.id,
    });
    return cat;
  }

  async update(actorId: string, id: string, dto: UpdateCategoryDto) {
    await this.ensure(id);
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      const clash = await this.prisma.aidCategory.findFirst({ where: { name: n, NOT: { id } } });
      if (clash) throw new ConflictException('اسم الفئة مستخدم مسبقاً');
    }
    const cat = await this.prisma.aidCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description,
        isActive: dto.isActive,
      },
      include: { items: true },
    });
    await this.audit.log({
      action: 'CATEGORY_UPDATED',
      actorUserId: actorId,
      entityType: 'AID_CATEGORY',
      entityId: id,
      details: dto as Prisma.InputJsonValue,
    });
    return cat;
  }

  /**
   * Hard-delete a category and all dependent rows (Admin / Super-admin). Order respects FKs.
   */
  private async cascadeDeleteCategory(tx: Prisma.TransactionClient, categoryId: string): Promise<void> {
    const items = await tx.aidCategoryItem.findMany({
      where: { aidCategoryId: categoryId },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);

    const stocks = await tx.stockItem.findMany({
      where: { aidCategoryItem: { aidCategoryId: categoryId } },
      select: { id: true },
    });
    const stockIds = stocks.map((s) => s.id);

    const distOr: Prisma.DistributionRecordItemWhereInput[] = [{ aidCategoryId: categoryId }];
    if (itemIds.length) distOr.push({ aidCategoryItemId: { in: itemIds } });
    if (stockIds.length) distOr.push({ stockItemId: { in: stockIds } });

    await tx.distributionRecordItem.deleteMany({ where: { OR: distOr } });
    await tx.beneficiaryCategory.deleteMany({ where: { categoryId } });
    if (stockIds.length) {
      await tx.stockMovement.deleteMany({ where: { stockItemId: { in: stockIds } } });
    }
    await tx.stockItem.deleteMany({ where: { aidCategoryItem: { aidCategoryId: categoryId } } });
    await tx.aidCategory.delete({ where: { id: categoryId } });
  }

  async remove(actor: AuthUser, id: string) {
    await this.ensure(id);
    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteCategory(tx, id);
    });
    await this.audit.log({
      action: 'CATEGORY_DELETED',
      actorUserId: actor.userId,
      entityType: 'AID_CATEGORY',
      entityId: id,
      details: { cascade: true, role: actor.roleCode } as Prisma.InputJsonValue,
    });
    return { ok: true };
  }

  /**
   * Same cascade as {@link remove}, with typed confirmation (Admin / Super-admin).
   */
  async forceDelete(actor: AuthUser, id: string, confirmationText: string, reason?: string) {
    if (actor.roleCode !== RoleCode.SUPER_ADMIN && actor.roleCode !== RoleCode.ADMIN) {
      throw new BadRequestException();
    }
    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException('Confirmation must be the word DELETE (exact match).');
    }
    await this.ensure(id);
    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteCategory(tx, id);
    });
    await this.audit.log({
      action: 'AID_CATEGORY_FORCE_DELETED',
      actorUserId: actor.userId,
      entityType: 'AID_CATEGORY',
      entityId: id,
      details: {
        actorRole: actor.roleCode,
        reason: reason ?? null,
        confirmationText: 'DELETE',
        cascade: true,
      } as Prisma.InputJsonValue,
    });
    return { ok: true, outcome: 'hard_deleted' as const };
  }

  async addItem(actorId: string, categoryId: string, dto: CreateCategoryItemDto) {
    await this.ensure(categoryId);
    const max = await this.prisma.aidCategoryItem.aggregate({
      where: { aidCategoryId: categoryId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.aidCategoryItem.create({
      data: {
        aidCategoryId: categoryId,
        name: dto.name.trim(),
        defaultQuantity: dto.defaultQuantity ?? 1,
        unit: dto.unit ?? StockUnit.PIECE,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    await this.audit.log({
      action: 'CATEGORY_ITEM_ADDED',
      actorUserId: actorId,
      entityType: 'AID_CATEGORY_ITEM',
      entityId: item.id,
    });
    return item;
  }

  async updateItem(actorId: string, itemId: string, dto: UpdateCategoryItemDto) {
    const item = await this.prisma.aidCategoryItem.update({
      where: { id: itemId },
      data: {
        name: dto.name?.trim(),
        defaultQuantity: dto.defaultQuantity,
        unit: dto.unit,
        sortOrder: dto.sortOrder,
      },
    });
    await this.audit.log({
      action: 'CATEGORY_ITEM_UPDATED',
      actorUserId: actorId,
      entityType: 'AID_CATEGORY_ITEM',
      entityId: itemId,
      details: dto as Prisma.InputJsonValue,
    });
    return item;
  }

  async removeItem(actorId: string, itemId: string) {
    const stock = await this.prisma.stockItem.findUnique({ where: { aidCategoryItemId: itemId } });
    if (stock) throw new BadRequestException('لا يمكن حذف البند طالما يوجد سجل مخزون له');
    const pendingLine = await this.prisma.distributionRecordItem.findFirst({
      where: {
        aidCategoryItemId: itemId,
        distributionRecord: { status: 'PENDING' },
      },
    });
    if (pendingLine) throw new BadRequestException('لا يمكن حذف البند وهو مستخدم في توزيع قيد الانتظار');
    await this.prisma.aidCategoryItem.delete({ where: { id: itemId } });
    await this.audit.log({
      action: 'CATEGORY_ITEM_DELETED',
      actorUserId: actorId,
      entityType: 'AID_CATEGORY_ITEM',
      entityId: itemId,
    });
    return { ok: true };
  }

  private async ensure(id: string) {
    const c = await this.prisma.aidCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    return c;
  }
}
