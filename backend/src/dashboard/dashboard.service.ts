import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BeneficiaryStatus,
  DistributionStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Rolling window: deliveries with `deliveredAt` in the last 7×24 hours. */
function weekAgoDate(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export type DashboardLowStockItem = {
  stockItemId: string;
  itemName: string;
  categoryName: string;
  remaining: number;
  threshold: number;
  outOfStock: boolean;
};

export type DashboardSummaryResponse = {
  beneficiaries: {
    total: number;
    active: number;
    inactive: number;
  };
  distributions: {
    deliveredThisWeek: number;
    pending: number;
    assigned: number;
    failed: number;
  };
  stock: {
    lowStockCount: number;
    outOfStockCount: number;
    lowStockItems: DashboardLowStockItem[];
  };
  aidCategories: {
    mostRequested: Array<{
      categoryId: string;
      categoryName: string;
      requestScore: number;
    }>;
    mostDeliveredThisWeek: Array<{
      categoryId: string;
      categoryName: string;
      deliveredQuantity: number;
    }>;
  };
  /** Present for delivery drivers: personal workload. */
  driver?: {
    myDeliveredThisWeek: number;
    pendingAssignedToMe: number;
  };
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Fallback when `lowStockThreshold` is 0 or invalid (env `DASHBOARD_LOW_STOCK_DEFAULT_THRESHOLD`, default 5). */
  private effectiveLowThreshold(rowThreshold: number): number {
    if (rowThreshold > 0) return rowThreshold;
    const raw = this.config.get<string>('DASHBOARD_LOW_STOCK_DEFAULT_THRESHOLD');
    const n = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n >= 0 ? n : 5;
  }

  /** DB may not include ASSIGNED until migration is applied. */
  private isMissingAssignedEnum(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientUnknownRequestError) {
      return err.message.includes('22P02') && err.message.includes('ASSIGNED');
    }
    return false;
  }

  private async countAssigned(): Promise<number> {
    try {
      return await this.prisma.distributionRecord.count({
        where: { status: DistributionStatus.ASSIGNED },
      });
    } catch (err) {
      if (this.isMissingAssignedEnum(err)) return 0;
      throw err;
    }
  }

  private async countDriverAssignedOpen(driverId: string): Promise<number> {
    try {
      return await this.prisma.distributionRecord.count({
        where: { driverId, status: DistributionStatus.ASSIGNED },
      });
    } catch (err) {
      if (this.isMissingAssignedEnum(err)) return 0;
      throw err;
    }
  }

  private async aggregateMostRequested(): Promise<
    DashboardSummaryResponse['aidCategories']['mostRequested']
  > {
    const scores = new Map<string, { categoryName: string; score: number }>();

    const itemNeeds = await this.prisma.beneficiaryItemNeed.findMany({
      where: {
        needed: true,
        beneficiary: { deletedAt: null },
      },
      select: {
        quantity: true,
        aidCategoryItem: {
          select: {
            aidCategory: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const row of itemNeeds) {
      const cat = row.aidCategoryItem.aidCategory;
      const q = Math.max(0, row.quantity);
      const contrib = q > 0 ? q : 1;
      const prev = scores.get(cat.id) ?? { categoryName: cat.name, score: 0 };
      prev.score += contrib;
      scores.set(cat.id, prev);
    }

    const legacy = await this.prisma.beneficiaryCategory.findMany({
      where: { beneficiary: { deletedAt: null } },
      select: {
        quantity: true,
        category: { select: { id: true, name: true } },
      },
    });

    for (const row of legacy) {
      const cat = row.category;
      const contrib = Math.max(1, row.quantity);
      const prev = scores.get(cat.id) ?? { categoryName: cat.name, score: 0 };
      prev.score += contrib;
      scores.set(cat.id, prev);
    }

    return [...scores.entries()]
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.categoryName,
        requestScore: v.score,
      }))
      .sort((a, b) => b.requestScore - a.requestScore)
      .slice(0, 10);
  }

  private async aggregateMostDeliveredThisWeek(
    since: Date,
  ): Promise<DashboardSummaryResponse['aidCategories']['mostDeliveredThisWeek']> {
    const grouped = await this.prisma.distributionRecordItem.groupBy({
      by: ['aidCategoryId'],
      where: {
        distributionRecord: {
          status: DistributionStatus.DELIVERED,
          deliveredAt: { gte: since },
        },
      },
      _sum: {
        quantityDelivered: true,
      },
    });

    const ids = grouped.map((g) => g.aidCategoryId);
    if (ids.length === 0) return [];

    const categories = await this.prisma.aidCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((c) => [c.id, c.name] as const));

    return grouped
      .map((g) => ({
        categoryId: g.aidCategoryId,
        categoryName: nameById.get(g.aidCategoryId) ?? '—',
        deliveredQuantity: g._sum.quantityDelivered ?? 0,
      }))
      .filter((r) => r.deliveredQuantity > 0)
      .sort((a, b) => b.deliveredQuantity - a.deliveredQuantity)
      .slice(0, 10);
  }

  async summary(actor: { userId: string; roleCode: RoleCode }): Promise<DashboardSummaryResponse> {
    const since = weekAgoDate();

    const stockRows = await this.prisma.stockItem.findMany({
      select: {
        id: true,
        quantityOnHand: true,
        quantityReserved: true,
        lowStockThreshold: true,
        aidCategoryItem: {
          select: {
            name: true,
            aidCategory: { select: { name: true } },
          },
        },
      },
    });

    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockItems: DashboardLowStockItem[] = [];

    for (const r of stockRows) {
      const remaining = r.quantityOnHand - r.quantityReserved;
      const threshold = this.effectiveLowThreshold(r.lowStockThreshold);
      const itemName = r.aidCategoryItem?.name ?? '—';
      const categoryName = r.aidCategoryItem?.aidCategory?.name ?? '—';
      const outOfStock = remaining <= 0;

      if (outOfStock) {
        outOfStockCount += 1;
        lowStockItems.push({
          stockItemId: r.id,
          itemName,
          categoryName,
          remaining,
          threshold,
          outOfStock: true,
        });
      } else if (remaining < threshold) {
        lowStockCount += 1;
        lowStockItems.push({
          stockItemId: r.id,
          itemName,
          categoryName,
          remaining,
          threshold,
          outOfStock: false,
        });
      }
    }

    lowStockItems.sort((a, b) => a.remaining - b.remaining);
    const lowStockItemsLimited = lowStockItems.slice(0, 25);

    const [
      beneficiariesTotal,
      beneficiariesActive,
      beneficiariesInactive,
      deliveredThisWeek,
      pendingCount,
      assignedCount,
      failedCount,
      mostRequested,
      mostDeliveredThisWeek,
    ] = await Promise.all([
      this.prisma.beneficiary.count({ where: { deletedAt: null } }),
      this.prisma.beneficiary.count({
        where: { deletedAt: null, status: BeneficiaryStatus.ACTIVE },
      }),
      this.prisma.beneficiary.count({
        where: { deletedAt: null, status: BeneficiaryStatus.INACTIVE },
      }),
      this.prisma.distributionRecord.count({
        where: {
          status: DistributionStatus.DELIVERED,
          deliveredAt: { gte: since },
        },
      }),
      this.prisma.distributionRecord.count({
        where: { status: DistributionStatus.PENDING },
      }),
      this.countAssigned(),
      this.prisma.distributionRecord.count({
        where: { status: DistributionStatus.CANCELLED },
      }),
      this.aggregateMostRequested(),
      this.aggregateMostDeliveredThisWeek(since),
    ]);

    const base: DashboardSummaryResponse = {
      beneficiaries: {
        total: beneficiariesTotal,
        active: beneficiariesActive,
        inactive: beneficiariesInactive,
      },
      distributions: {
        deliveredThisWeek,
        pending: pendingCount,
        assigned: assignedCount,
        failed: failedCount,
      },
      stock: {
        lowStockCount,
        outOfStockCount,
        lowStockItems: lowStockItemsLimited,
      },
      aidCategories: {
        mostRequested,
        mostDeliveredThisWeek,
      },
    };

    if (actor.roleCode === RoleCode.DELIVERY) {
      const uid = actor.userId;
      const [myDeliveredThisWeek, pendingAssignedToMe] = await Promise.all([
        this.prisma.distributionRecord.count({
          where: {
            completedById: uid,
            status: DistributionStatus.DELIVERED,
            deliveredAt: { gte: since },
          },
        }),
        this.countDriverAssignedOpen(uid),
      ]);
      return {
        ...base,
        driver: {
          myDeliveredThisWeek,
          pendingAssignedToMe,
        },
      };
    }

    return base;
  }
}
