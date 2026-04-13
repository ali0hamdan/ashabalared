import { Injectable, Logger } from '@nestjs/common';
import { BeneficiaryStatus, DistributionStatus, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Low-stock row returned to the client (plain JSON, no Prisma relation cycles). */
export type DashboardLowStockRow = {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  availableQuantity: number;
  reservedQuantity: number;
  remaining: number;
  threshold: number;
  itemName: string;
  categoryName: string;
  isLow: boolean;
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** DB may not include ASSIGNED until migration `20260413000000_distribution_assigned_status` is applied. */
  private isMissingAssignedEnum(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientUnknownRequestError) {
      return err.message.includes('22P02') && err.message.includes('ASSIGNED');
    }
    return false;
  }

  private async countPendingWorkflowDistributions(): Promise<number> {
    try {
      return await this.prisma.distributionRecord.count({
        where: { status: { in: [DistributionStatus.PENDING, DistributionStatus.ASSIGNED] } },
      });
    } catch (err) {
      if (this.isMissingAssignedEnum(err)) {
        return this.prisma.distributionRecord.count({ where: { status: DistributionStatus.PENDING } });
      }
      throw err;
    }
  }

  private async countDriverAssignedOpen(driverId: string): Promise<number> {
    try {
      return await this.prisma.distributionRecord.count({
        where: { driverId, status: DistributionStatus.ASSIGNED },
      });
    } catch (err) {
      if (this.isMissingAssignedEnum(err)) {
        return 0;
      }
      throw err;
    }
  }

  async summary(actor: { userId: string; roleCode: RoleCode }) {
    const today = startOfToday();

    let lowStock: DashboardLowStockRow[] = [];
    try {
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
      lowStock = stockRows
        .map((r) => {
          const availableQuantity = r.quantityOnHand;
          const reservedQuantity = r.quantityReserved;
          const remaining = availableQuantity - reservedQuantity;
          const threshold = r.lowStockThreshold;
          const isLow = remaining < threshold;
          const itemName = r.aidCategoryItem?.name ?? '—';
          const categoryName = r.aidCategoryItem?.aidCategory?.name ?? '—';
          return {
            id: r.id,
            quantityOnHand: r.quantityOnHand,
            quantityReserved: r.quantityReserved,
            lowStockThreshold: r.lowStockThreshold,
            availableQuantity,
            reservedQuantity,
            remaining,
            threshold,
            itemName,
            categoryName,
            isLow,
          };
        })
        .filter((r) => r.isLow);
    } catch (err) {
      this.logger.error('dashboard.summary: stock low-stock query failed', err instanceof Error ? err.stack : String(err));
      throw err;
    }

    const [
      beneficiariesTotal,
      beneficiariesActive,
      admins,
      deliveryUsers,
      distributionsTotal,
      pendingDist,
      deliveredToday,
    ] = await Promise.all([
      this.prisma.beneficiary.count({ where: { deletedAt: null } }),
      this.prisma.beneficiary.count({
        where: { deletedAt: null, status: BeneficiaryStatus.ACTIVE },
      }),
      this.prisma.user.count({ where: { isActive: true, role: { code: RoleCode.ADMIN } } }),
      this.prisma.user.count({ where: { isActive: true, role: { code: RoleCode.DELIVERY } } }),
      this.prisma.distributionRecord.count(),
      this.countPendingWorkflowDistributions(),
      this.prisma.distributionRecord.count({
        where: { status: DistributionStatus.DELIVERED, deliveredAt: { gte: today } },
      }),
    ]);

    const base = {
      lowStock,
      deliveredToday,
    };

    if (actor.roleCode === RoleCode.SUPER_ADMIN) {
      return {
        ...base,
        role: RoleCode.SUPER_ADMIN,
        beneficiariesTotal,
        admins,
        deliveryUsers,
        distributionsTotal,
        pendingDist,
        lowStockCount: lowStock.length,
      };
    }

    if (actor.roleCode === RoleCode.ADMIN) {
      return {
        ...base,
        role: RoleCode.ADMIN,
        beneficiariesActive,
        pendingRequests: pendingDist,
        lowStockCount: lowStock.length,
      };
    }

    const uid = actor.userId;
    const [myDeliveredToday, pendingOpen] = await Promise.all([
      this.prisma.distributionRecord.count({
        where: {
          completedById: uid,
          status: DistributionStatus.DELIVERED,
          deliveredAt: { gte: today },
        },
      }),
      this.countDriverAssignedOpen(uid),
    ]);

    return {
      role: RoleCode.DELIVERY,
      myDeliveredToday,
      pendingOpen,
    };
  }
}
