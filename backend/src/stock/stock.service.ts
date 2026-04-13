import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DistributionStatus, Prisma, RoleCode, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';

/** Select shape for API responses: avoids 1:1 StockItem⇄AidCategoryItem cycles that break JSON.stringify. */
const stockItemResponseSelect = {
  id: true,
  aidCategoryItemId: true,
  quantityOnHand: true,
  quantityReserved: true,
  lowStockThreshold: true,
  supplier: true,
  expiryDate: true,
  createdAt: true,
  updatedAt: true,
  aidCategoryItem: {
    select: {
      id: true,
      aidCategoryId: true,
      name: true,
      defaultQuantity: true,
      unit: true,
      sortOrder: true,
      aidCategory: {
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.StockItemSelect;

type StockRowPayload = Prisma.StockItemGetPayload<{ select: typeof stockItemResponseSelect }>;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async deliveredTotalsByStockItemId(stockItemIds: string[]): Promise<Map<string, number>> {
    if (stockItemIds.length === 0) return new Map();
    const sums = await this.prisma.distributionRecordItem.groupBy({
      by: ['stockItemId'],
      where: {
        stockItemId: { in: stockItemIds },
        distributionRecord: { status: DistributionStatus.DELIVERED },
      },
      _sum: { quantityDelivered: true },
    });
    return new Map(sums.map((s) => [s.stockItemId, s._sum.quantityDelivered ?? 0]));
  }

  async list(query: {
    categoryId?: string;
    lowOnly?: boolean;
    hasAvailable?: boolean;
    q?: string;
  }) {
    const where: Prisma.StockItemWhereInput = {};
    if (query.categoryId) {
      where.aidCategoryItem = { aidCategoryId: query.categoryId };
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { aidCategoryItem: { name: { contains: q, mode: 'insensitive' } } },
        { supplier: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.stockItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: stockItemResponseSelect,
    });
    const deliveredMap = await this.deliveredTotalsByStockItemId(rows.map((r) => r.id));
    let out = rows.map((r) => this.mapStockRow(r, deliveredMap.get(r.id) ?? 0));
    if (query.lowOnly) out = out.filter((r) => r.isLow);
    if (query.hasAvailable) out = out.filter((r) => r.remaining > 0);
    return out;
  }

  async create(actorId: string, body: CreateStockItemDto) {
    const item = await this.prisma.aidCategoryItem.findUnique({
      where: { id: body.aidCategoryItemId },
      include: { stockItem: true },
    });
    if (!item) throw new NotFoundException('بند الفئة غير موجود');
    if (item.stockItem) throw new BadRequestException('يوجد مخزون مسجل لهذا البند مسبقاً');
    const qty = body.quantityOnHand ?? 0;
    if (qty < 0) throw new BadRequestException('كمية غير صالحة');
    const stock = await this.prisma.stockItem.create({
      data: {
        aidCategoryItemId: body.aidCategoryItemId,
        quantityOnHand: qty,
        quantityReserved: 0,
        lowStockThreshold: body.lowStockThreshold ?? 10,
        supplier: body.supplier,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      },
      select: stockItemResponseSelect,
    });
    await this.audit.log({
      action: 'STOCK_ITEM_CREATED',
      actorUserId: actorId,
      entityType: 'STOCK_ITEM',
      entityId: stock.id,
    });
    const deliveredMap = await this.deliveredTotalsByStockItemId([stock.id]);
    return this.mapStockRow(stock, deliveredMap.get(stock.id) ?? 0);
  }

  async update(actorId: string, id: string, body: UpdateStockItemDto) {
    const cur = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    const nextOnHand = body.quantityOnHand !== undefined ? body.quantityOnHand : cur.quantityOnHand;
    const nextReserved = body.quantityReserved !== undefined ? body.quantityReserved : cur.quantityReserved;
    const nextThreshold = body.lowStockThreshold !== undefined ? body.lowStockThreshold : cur.lowStockThreshold;
    if (nextOnHand < 0 || nextReserved < 0) throw new BadRequestException('كميات سالبة غير مسموحة');
    if (nextOnHand < nextReserved) throw new BadRequestException('المتاح لا يمكن أن يكون أقل من المحجوز');
    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: {
        quantityOnHand: nextOnHand,
        quantityReserved: nextReserved,
        lowStockThreshold: nextThreshold,
        supplier: body.supplier === undefined ? undefined : body.supplier,
        expiryDate: body.expiryDate === undefined ? undefined : body.expiryDate ? new Date(body.expiryDate) : null,
      },
      select: stockItemResponseSelect,
    });
    await this.audit.log({
      action: 'STOCK_UPDATED',
      actorUserId: actorId,
      entityType: 'STOCK_ITEM',
      entityId: id,
      details: body as Prisma.InputJsonValue,
    });
    const deliveredMap = await this.deliveredTotalsByStockItemId([updated.id]);
    return this.mapStockRow(updated, deliveredMap.get(updated.id) ?? 0);
  }

  async adjust(actorId: string, id: string, body: { delta: number; note?: string }) {
    if (body.delta === undefined || body.delta === null) throw new BadRequestException('delta مطلوب');
    const item = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const next = item.quantityOnHand + body.delta;
    if (next < 0) throw new BadRequestException('لا يمكن جعل المخزون سالباً');
    if (next < item.quantityReserved) throw new BadRequestException('الكمية أقل من المحجوز');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.stockItem.update({
        where: { id },
        data: { quantityOnHand: next },
        select: stockItemResponseSelect,
      });
      await tx.stockMovement.create({
        data: {
          stockItemId: id,
          quantityDelta: body.delta,
          movementType: body.delta >= 0 ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT,
          note: body.note,
          createdById: actorId,
        },
      });
      return u;
    });
    await this.audit.log({
      action: 'STOCK_UPDATED',
      actorUserId: actorId,
      entityType: 'STOCK_ITEM',
      entityId: id,
      details: body as Prisma.InputJsonValue,
    });
    const deliveredMap = await this.deliveredTotalsByStockItemId([updated.id]);
    return this.mapStockRow(updated, deliveredMap.get(updated.id) ?? 0);
  }

  private async cascadeDeleteStockItem(tx: Prisma.TransactionClient, stockItemId: string): Promise<void> {
    await tx.distributionRecordItem.deleteMany({ where: { stockItemId } });
    await tx.stockMovement.deleteMany({ where: { stockItemId } });
    await tx.stockItem.delete({ where: { id: stockItemId } });
  }

  async remove(actorId: string, id: string) {
    const row = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteStockItem(tx, id);
    });
    await this.audit.log({
      action: 'STOCK_ITEM_DELETED',
      actorUserId: actorId,
      entityType: 'STOCK_ITEM',
      entityId: id,
      details: { cascade: true } as Prisma.InputJsonValue,
    });
    return { ok: true };
  }

  private assertForceConfirmation(confirmationText: string) {
    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException('Confirmation must be the word DELETE (exact match).');
    }
  }

  /**
   * Same cascade as {@link remove}, with typed confirmation (Admin / Super-admin).
   */
  async forceDelete(actor: AuthUser, id: string, confirmationText: string, reason?: string) {
    if (actor.roleCode !== RoleCode.SUPER_ADMIN && actor.roleCode !== RoleCode.ADMIN) {
      throw new BadRequestException();
    }
    this.assertForceConfirmation(confirmationText);
    const row = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteStockItem(tx, id);
    });
    await this.audit.log({
      action: 'STOCK_ITEM_FORCE_DELETED',
      actorUserId: actor.userId,
      entityType: 'STOCK_ITEM',
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

  movements(stockItemId: string) {
    return this.prisma.stockMovement.findMany({
      where: { stockItemId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { displayName: true, username: true } } },
      take: 200,
    });
  }

  private mapStockRow(r: StockRowPayload, deliveredQuantity: number) {
    const availableQuantity = r.quantityOnHand;
    const reservedQuantity = r.quantityReserved;
    const remaining = availableQuantity - reservedQuantity;
    const threshold = r.lowStockThreshold;
    const stockStatus = remaining < threshold ? 'LOW' : 'OK';
    return {
      id: r.id,
      aidCategoryItemId: r.aidCategoryItemId,
      quantityOnHand: r.quantityOnHand,
      quantityReserved: r.quantityReserved,
      lowStockThreshold: r.lowStockThreshold,
      supplier: r.supplier,
      expiryDate: r.expiryDate,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      aidCategoryItem: r.aidCategoryItem,
      availableQuantity,
      reservedQuantity,
      remaining,
      deliveredQuantity,
      threshold,
      stockStatus,
      isLow: stockStatus === 'LOW',
    };
  }
}
