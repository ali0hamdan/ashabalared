import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BeneficiaryStatus, Prisma, RoleCode, StockUnit } from '@prisma/client';
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
      const clash = await this.prisma.aidCategory.findFirst({
        where: { name: n, NOT: { id } },
      });
      if (clash) throw new ConflictException('اسم الفئة مستخدم مسبقاً');
    }
    const cat = await this.prisma.aidCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined ? undefined : dto.description,
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
  private async cascadeDeleteCategory(
    tx: Prisma.TransactionClient,
    categoryId: string,
  ): Promise<void> {
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

    const distOr: Prisma.DistributionRecordItemWhereInput[] = [
      { aidCategoryId: categoryId },
    ];
    if (itemIds.length) distOr.push({ aidCategoryItemId: { in: itemIds } });
    if (stockIds.length) distOr.push({ stockItemId: { in: stockIds } });

    await tx.distributionRecordItem.deleteMany({ where: { OR: distOr } });
    await tx.beneficiaryCategory.deleteMany({ where: { categoryId } });
    if (stockIds.length) {
      await tx.stockMovement.deleteMany({
        where: { stockItemId: { in: stockIds } },
      });
    }
    await tx.stockItem.deleteMany({
      where: { aidCategoryItem: { aidCategoryId: categoryId } },
    });
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
  async forceDelete(
    actor: AuthUser,
    id: string,
    confirmationText: string,
    reason?: string,
  ) {
    if (
      actor.roleCode !== RoleCode.SUPER_ADMIN &&
      actor.roleCode !== RoleCode.ADMIN
    ) {
      throw new BadRequestException();
    }
    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException(
        'Confirmation must be the word DELETE (exact match).',
      );
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

  async addItem(
    actorId: string,
    categoryId: string,
    dto: CreateCategoryItemDto,
  ) {
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

  async updateItem(
    actorId: string,
    itemId: string,
    dto: UpdateCategoryItemDto,
  ) {
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
    const stock = await this.prisma.stockItem.findUnique({
      where: { aidCategoryItemId: itemId },
    });
    if (stock)
      throw new BadRequestException(
        'لا يمكن حذف البند طالما يوجد سجل مخزون له',
      );
    const pendingLine = await this.prisma.distributionRecordItem.findFirst({
      where: {
        aidCategoryItemId: itemId,
        distributionRecord: { status: 'PENDING' },
      },
    });
    if (pendingLine)
      throw new BadRequestException(
        'لا يمكن حذف البند وهو مستخدم في توزيع قيد الانتظار',
      );
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

  /**
   * Beneficiaries who need this aid category: item-level needs (needed, qty ≥ 1 or notes) under the category’s items,
   * or any `BeneficiaryCategory` row for this category (including quantity 0 = category checkbox only).
   */
  async beneficiariesNeedingCategory(categoryId: string, q?: string) {
    const category = await this.prisma.aidCategory.findFirst({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException();

    const qTrim = q?.trim() || undefined;
    const beneficiaryMatch: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      status: BeneficiaryStatus.ACTIVE,
      ...(qTrim
        ? {
            OR: [
              { fullName: { contains: qTrim, mode: 'insensitive' } },
              { phone: { contains: qTrim, mode: 'insensitive' } },
              { area: { contains: qTrim, mode: 'insensitive' } },
              { addressLine: { contains: qTrim, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.aidCategoryItem.findMany({
      where: { aidCategoryId: categoryId },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);

    type Line = {
      itemName: string;
      quantity: number;
      notes: string | null;
      legacy?: boolean;
    };
    type Acc = {
      id: string;
      fullName: string;
      phone: string;
      area: string | null;
      addressLine: string | null;
      familyCount: number;
      lines: Line[];
    };
    const byBen = new Map<string, Acc>();

    const qualifiesItemNeed = (row: {
      needed: boolean;
      quantity: number;
      notes: string | null;
    }) => {
      if (!row.needed) return false;
      const n = (row.notes ?? '').trim();
      return (row.quantity ?? 0) >= 1 || n.length > 0;
    };

    if (itemIds.length) {
      const rows = await this.prisma.beneficiaryItemNeed.findMany({
        where: {
          aidCategoryItemId: { in: itemIds },
          beneficiary: beneficiaryMatch,
        },
        include: {
          beneficiary: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              area: true,
              addressLine: true,
              familyCount: true,
            },
          },
          aidCategoryItem: { select: { name: true } },
        },
      });
      for (const r of rows) {
        if (!qualifiesItemNeed(r)) continue;
        const b = r.beneficiary;
        let acc = byBen.get(b.id);
        if (!acc) {
          acc = {
            id: b.id,
            fullName: b.fullName,
            phone: b.phone,
            area: b.area,
            addressLine: b.addressLine,
            familyCount: b.familyCount,
            lines: [],
          };
          byBen.set(b.id, acc);
        }
        acc.lines.push({
          itemName: r.aidCategoryItem.name,
          quantity: r.quantity,
          notes: r.notes,
        });
      }
    }

    const legacyRows = await this.prisma.beneficiaryCategory.findMany({
      where: {
        categoryId,
        beneficiary: beneficiaryMatch,
      },
      include: {
        beneficiary: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            area: true,
            addressLine: true,
            familyCount: true,
          },
        },
      },
    });
    for (const r of legacyRows) {
      const b = r.beneficiary;
      let acc = byBen.get(b.id);
      if (!acc) {
        acc = {
          id: b.id,
          fullName: b.fullName,
          phone: b.phone,
          area: b.area,
          addressLine: b.addressLine,
          familyCount: b.familyCount,
          lines: [],
        };
        byBen.set(b.id, acc);
      }
      acc.lines.push({
        itemName: category.name,
        quantity: r.quantity,
        notes: r.notes,
        legacy: true,
      });
    }

    const beneficiaries = [...byBen.values()]
      .map((b) => ({
        id: b.id,
        fullName: b.fullName,
        phone: b.phone,
        area: b.area,
        street: b.addressLine,
        familyCount: b.familyCount,
        lines: b.lines.sort((a, c) => a.itemName.localeCompare(c.itemName)),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      categoryId: category.id,
      categoryName: category.name,
      count: beneficiaries.length,
      beneficiaries,
    };
  }
}
