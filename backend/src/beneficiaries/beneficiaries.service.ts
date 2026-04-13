import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BeneficiaryStatus, DistributionStatus, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { deleteBlocked } from '../common/http/delete-blocked';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import type { BeneficiaryCategoryNeedDto } from './dto/beneficiary-category-need.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private beneficiaryInclude() {
    return {
      region: true,
      categories: { include: { category: true } },
      _count: { select: { distributions: true } },
    } satisfies Prisma.BeneficiaryInclude;
  }

  /** List endpoint only: avoids loading BeneficiaryCategory rows (e.g. DB missing `quantity` column before migrate). */
  private beneficiaryListInclude() {
    return {
      region: true,
      _count: { select: { distributions: true } },
    } satisfies Prisma.BeneficiaryInclude;
  }

  /** Merge needs: only quantities ≥ 1; last wins per categoryId (quantity + notes). */
  private normalizeCategoryNeeds(
    categoryNeeds?: BeneficiaryCategoryNeedDto[],
    categoryIds?: string[],
  ): { categoryId: string; quantity: number; notes: string | null }[] {
    if (categoryNeeds?.length) {
      const map = new Map<string, { quantity: number; notes: string | null }>();
      for (const n of categoryNeeds) {
        if (!n?.categoryId || n.quantity < 1) continue;
        const trimmed = typeof n.notes === 'string' ? n.notes.trim() : '';
        map.set(n.categoryId, {
          quantity: n.quantity,
          notes: trimmed.length ? trimmed : null,
        });
      }
      return [...map.entries()].map(([categoryId, v]) => ({
        categoryId,
        quantity: v.quantity,
        notes: v.notes,
      }));
    }
    if (categoryIds?.length) {
      return [...new Set(categoryIds)].map((categoryId) => ({ categoryId, quantity: 1, notes: null }));
    }
    return [];
  }

  private async ensureCategoryIdsExist(ids: string[]) {
    if (!ids.length) return;
    const found = await this.prisma.aidCategory.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('فئة مساعدة غير صالحة');
  }

  private normalizeBeneficiaryStatus(raw?: string): BeneficiaryStatus | undefined {
    if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
    const v = String(raw).trim() as BeneficiaryStatus;
    if (!Object.values(BeneficiaryStatus).includes(v)) {
      throw new BadRequestException(`Invalid beneficiary status: ${raw}`);
    }
    return v;
  }

  async list(query: { q?: string; status?: BeneficiaryStatus | string; regionId?: string }) {
    const where: Prisma.BeneficiaryWhereInput = { deletedAt: null };
    const status = this.normalizeBeneficiaryStatus(query.status as string | undefined);
    if (status) where.status = status;
    const regionId = query.regionId?.trim() || undefined;
    if (regionId) where.regionId = regionId;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { area: { contains: q, mode: 'insensitive' } },
        { district: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.beneficiary.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: this.beneficiaryListInclude(),
    });
  }

  async get(id: string) {
    const b = await this.prisma.beneficiary.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.beneficiaryInclude(),
        distributions: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                aidCategory: true,
                aidCategoryItem: {
                  select: {
                    id: true,
                    aidCategoryId: true,
                    name: true,
                    defaultQuantity: true,
                    unit: true,
                    sortOrder: true,
                  },
                },
                stockItem: {
                  select: {
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
                  },
                },
              },
            },
            createdBy: { select: { id: true, displayName: true, username: true } },
            completedBy: { select: { id: true, displayName: true } },
          },
        },
        timelineEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!b) throw new NotFoundException();
    return b;
  }

  async create(actorId: string, dto: CreateBeneficiaryDto) {
    const { categoryNeeds, categoryIds, ...rest } = dto;
    const needs = this.normalizeCategoryNeeds(categoryNeeds, categoryIds);
    await this.ensureCategoryIdsExist(needs.map((n) => n.categoryId));
    const beneficiary = await this.prisma.beneficiary.create({
      data: {
        fullName: rest.fullName,
        phone: rest.phone,
        regionId: rest.regionId ?? null,
        district: rest.district ?? null,
        area: rest.area,
        addressLine: rest.addressLine ?? null,
        familyCount: rest.familyCount,
        cookingStove: rest.cookingStove ?? false,
        notes: rest.notes ?? null,
        medicalNotes: rest.medicalNotes ?? null,
        deliveryNotes: rest.deliveryNotes ?? null,
        status: rest.status ?? BeneficiaryStatus.ACTIVE,
        categories: needs.length
          ? {
              create: needs.map((n) => ({
                categoryId: n.categoryId,
                quantity: n.quantity,
                notes: n.notes,
              })),
            }
          : undefined,
      },
      include: this.beneficiaryInclude(),
    });
    await this.prisma.beneficiaryTimelineEvent.create({
      data: {
        beneficiaryId: beneficiary.id,
        titleAr: 'إنشاء ملف المستفيد',
        eventType: 'BENEFICIARY_CREATED',
        relatedId: beneficiary.id,
      },
    });
    await this.audit.log({
      action: 'BENEFICIARY_CREATED',
      actorUserId: actorId,
      entityType: 'BENEFICIARY',
      entityId: beneficiary.id,
    });
    return beneficiary;
  }

  async update(actorId: string, id: string, dto: UpdateBeneficiaryDto) {
    await this.ensure(id);
    const { categoryNeeds, categoryIds, regionId, ...scalar } = dto;
    const replaceCategories = dto.categoryNeeds !== undefined || dto.categoryIds !== undefined;
    const needs = replaceCategories ? this.normalizeCategoryNeeds(categoryNeeds, categoryIds) : null;
    if (replaceCategories) await this.ensureCategoryIdsExist(needs!.map((n) => n.categoryId));
    const data: Prisma.BeneficiaryUpdateInput = {};
    if (scalar.fullName !== undefined) data.fullName = scalar.fullName;
    if (scalar.phone !== undefined) data.phone = scalar.phone;
    if (scalar.district !== undefined) data.district = scalar.district;
    if (scalar.area !== undefined) data.area = scalar.area;
    if (scalar.addressLine !== undefined) data.addressLine = scalar.addressLine;
    if (scalar.familyCount !== undefined) data.familyCount = scalar.familyCount;
    if (scalar.cookingStove !== undefined) data.cookingStove = scalar.cookingStove;
    if (scalar.notes !== undefined) data.notes = scalar.notes;
    if (scalar.medicalNotes !== undefined) data.medicalNotes = scalar.medicalNotes;
    if (scalar.deliveryNotes !== undefined) data.deliveryNotes = scalar.deliveryNotes;
    if (scalar.status !== undefined) data.status = scalar.status;
    if (regionId !== undefined) {
      if (regionId === null) data.region = { disconnect: true };
      else data.region = { connect: { id: regionId } };
    }
    const beneficiary = await this.prisma.beneficiary.update({
      where: { id },
      data: {
        ...data,
        ...(replaceCategories
          ? {
              categories: {
                deleteMany: {},
                ...(needs!.length
                  ? {
                      create: needs!.map((n) => ({
                        categoryId: n.categoryId,
                        quantity: n.quantity,
                        notes: n.notes,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: this.beneficiaryInclude(),
    });
    await this.prisma.beneficiaryTimelineEvent.create({
      data: {
        beneficiaryId: id,
        titleAr: 'تحديث بيانات الملف',
        eventType: 'BENEFICIARY_UPDATED',
      },
    });
    await this.audit.log({
      action: 'BENEFICIARY_UPDATED',
      actorUserId: actorId,
      entityType: 'BENEFICIARY',
      entityId: id,
      details: dto as object,
    });
    return beneficiary;
  }

  async archive(actorId: string, id: string) {
    await this.ensure(id);
    const open = await this.prisma.distributionRecord.count({
      where: {
        beneficiaryId: id,
        status: { in: [DistributionStatus.PENDING, DistributionStatus.ASSIGNED] },
      },
    });
    if (open > 0) {
      throw deleteBlocked(
        'This beneficiary has open distributions (pending or assigned). Cancel or complete them first, or use a super-admin override.',
        ['openDistributions'],
        { openCount: open },
      );
    }
    await this.prisma.beneficiary.update({
      where: { id },
      data: { status: BeneficiaryStatus.ARCHIVED, deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'BENEFICIARY_ARCHIVED',
      actorUserId: actorId,
      entityType: 'BENEFICIARY',
      entityId: id,
    });
    return { ok: true };
  }

  /**
   * Cancels all pending/assigned distributions for this beneficiary, then archives the file.
   * Admin / Super-admin (controller).
   */
  async forceArchive(actor: AuthUser, id: string, confirmationText: string, reason?: string) {
    if (actor.roleCode !== RoleCode.SUPER_ADMIN && actor.roleCode !== RoleCode.ADMIN) {
      throw new BadRequestException();
    }
    if (String(confirmationText ?? '').trim() !== 'DELETE') {
      throw new BadRequestException('Confirmation must be the word DELETE (exact match).');
    }
    await this.ensure(id);
    const cancelled = await this.prisma.distributionRecord.updateMany({
      where: {
        beneficiaryId: id,
        status: { in: [DistributionStatus.PENDING, DistributionStatus.ASSIGNED] },
      },
      data: {
        status: DistributionStatus.CANCELLED,
        cancelledAt: new Date(),
        driverId: null,
        assignedAt: null,
      },
    });
    await this.prisma.beneficiary.update({
      where: { id },
      data: { status: BeneficiaryStatus.ARCHIVED, deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'BENEFICIARY_FORCE_ARCHIVED',
      actorUserId: actor.userId,
      entityType: 'BENEFICIARY',
      entityId: id,
      details: {
        actorRole: actor.roleCode,
        reason: reason ?? null,
        confirmationText: 'DELETE',
        cancelledOpenDistributions: cancelled.count,
      },
    });
    return { ok: true, cancelledOpenDistributions: cancelled.count };
  }

  private async ensure(id: string) {
    const b = await this.prisma.beneficiary.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw new NotFoundException();
    return b;
  }

  /**
   * All non-deleted beneficiaries with only DELIVERED distributions and line-level quantities.
   */
  async deliveredHistory() {
    const rows = await this.prisma.beneficiary.findMany({
      where: { deletedAt: null },
      orderBy: { fullName: 'asc' },
      include: {
        distributions: {
          where: { status: DistributionStatus.DELIVERED },
          orderBy: { deliveredAt: 'desc' },
          include: {
            items: {
              include: {
                aidCategoryItem: { include: { aidCategory: true } },
                aidCategory: true,
                stockItem: {
                  include: {
                    aidCategoryItem: { include: { aidCategory: true } },
                  },
                },
              },
            },
            driver: { select: { id: true, displayName: true, username: true } },
            completedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    return rows.map((b) => {
      const deliveries = b.distributions.map((d) => ({
        id: d.id,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        status: d.status,
        driverDisplayName: d.driver?.displayName ?? null,
        driverUsername: d.driver?.username ?? null,
        completedByDisplayName: d.completedBy?.displayName ?? null,
        lines: d.items.map((it) => ({
          itemName: this.lineItemDisplayName(it),
          quantity: this.lineDeliveredQuantity(it),
        })),
      }));

      const lastDeliveredAt = b.distributions[0]?.deliveredAt?.toISOString() ?? null;

      return {
        id: b.id,
        fullName: b.fullName,
        phone: b.phone,
        area: b.area,
        familyCount: b.familyCount,
        totalDeliveredDistributions: b.distributions.length,
        lastDeliveredAt,
        deliveries,
      };
    });
  }

  private lineItemDisplayName(it: {
    aidCategoryItem?: { name: string } | null;
    aidCategory?: { name: string } | null;
    stockItem?: { aidCategoryItem?: { name: string } | null } | null;
  }): string {
    return (
      it.aidCategoryItem?.name ??
      it.stockItem?.aidCategoryItem?.name ??
      it.aidCategory?.name ??
      '—'
    );
  }

  private lineDeliveredQuantity(it: { quantityDelivered: number; quantityPlanned: number }): number {
    const d = it.quantityDelivered ?? 0;
    if (d > 0) return d;
    return it.quantityPlanned ?? 0;
  }

  async exportCsv() {
    const rows = await this.prisma.beneficiary.findMany({
      where: { deletedAt: null },
      include: { region: true },
      orderBy: { updatedAt: 'desc' },
    });
    const header = ['الاسم', 'الهاتف', 'المنطقة', 'القضاء', 'الحي', 'عدد الأفراد', 'الحالة', 'ملاحظات'];
    const lines = rows.map((r) =>
      [
        r.fullName,
        r.phone,
        r.region?.nameAr ?? '',
        r.district ?? '',
        r.area ?? '',
        String(r.familyCount),
        r.status,
        (r.notes ?? '').replace(/\r?\n/g, ' '),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }
}
