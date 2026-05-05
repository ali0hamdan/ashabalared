import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BeneficiaryStatus,
  DistributionStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { deleteBlocked } from '../common/http/delete-blocked';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { isAllowedBeneficiaryArea } from './constants/beneficiary-areas';
import type { BeneficiaryCategoryNeedDto } from './dto/beneficiary-category-need.dto';
import type { BeneficiaryItemNeedDto } from './dto/beneficiary-item-need.dto';

/** Stored when no phone is supplied (non-empty display; satisfies legacy min length). */
const BENEFICIARY_PHONE_NOT_PROVIDED = 'غير متوفر';

type ItemNeedRow = Prisma.BeneficiaryItemNeedGetPayload<{
  include: { aidCategoryItem: { include: { aidCategory: true } } };
}>;

export type ItemNeedsByCategoryGroup = {
  category: ItemNeedRow['aidCategoryItem']['aidCategory'];
  needs: Array<{
    id: string;
    needed: boolean;
    quantity: number;
    notes: string | null;
    aidCategoryItem: ItemNeedRow['aidCategoryItem'];
  }>;
};

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private beneficiaryInclude(): Prisma.BeneficiaryInclude {
    return {
      region: true,
      categories: { include: { category: true } },
      itemNeeds: {
        orderBy: { aidCategoryItem: { sortOrder: 'asc' } },
        include: {
          aidCategoryItem: { include: { aidCategory: true } },
        },
      },
      _count: { select: { distributions: true } },
    };
  }

  /**
   * List endpoint: compact relations for table (needs chips + legacy category needs).
   */
  private beneficiaryListInclude(): Prisma.BeneficiaryInclude {
    return {
      region: true,
      categories: {
        include: { category: { select: { id: true, name: true } } },
      },
      itemNeeds: {
        where: { needed: true, quantity: { gte: 1 } },
        orderBy: { aidCategoryItem: { name: 'asc' } },
        include: {
          aidCategoryItem: { select: { id: true, name: true } },
        },
      },
      _count: { select: { distributions: true } },
    } satisfies Prisma.BeneficiaryInclude;
  }

  /** Last wins per categoryId. Quantity may be 0 (category checkbox only). Skips entries with needed === false. */
  private normalizeCategoryNeeds(
    categoryNeeds?: BeneficiaryCategoryNeedDto[],
    categoryIds?: string[],
  ): { categoryId: string; quantity: number; notes: string | null }[] {
    if (categoryNeeds?.length) {
      const map = new Map<string, { quantity: number; notes: string | null }>();
      for (const n of categoryNeeds) {
        if (!n?.categoryId || n.needed === false) continue;
        const qty =
          typeof n.quantity === 'number' && Number.isFinite(n.quantity)
            ? Math.max(0, Math.floor(n.quantity))
            : 0;
        const trimmed = typeof n.notes === 'string' ? n.notes.trim() : '';
        map.set(n.categoryId, {
          quantity: qty,
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
      return [...new Set(categoryIds)].map((categoryId) => ({
        categoryId,
        quantity: 0,
        notes: null,
      }));
    }
    return [];
  }

  /** Last wins per `aidCategoryItemId`. Quantity defaults to 0. */
  private normalizeItemNeeds(itemNeeds?: BeneficiaryItemNeedDto[]): {
    aidCategoryItemId: string;
    needed: boolean;
    quantity: number;
    notes: string | null;
  }[] {
    if (!itemNeeds?.length) return [];
    const map = new Map<
      string,
      { needed: boolean; quantity: number; notes: string | null }
    >();
    for (const n of itemNeeds) {
      if (!n?.aidCategoryItemId?.trim()) continue;
      const id = n.aidCategoryItemId.trim();
      const quantity =
        typeof n.quantity === 'number' && Number.isFinite(n.quantity)
          ? Math.max(0, Math.floor(n.quantity))
          : 0;
      const trimmed = typeof n.notes === 'string' ? n.notes.trim() : '';
      map.set(id, {
        needed: Boolean(n.needed),
        quantity,
        notes: trimmed.length ? trimmed : null,
      });
    }
    return [...map.entries()].map(([aidCategoryItemId, v]) => ({
      aidCategoryItemId,
      needed: v.needed,
      quantity: v.quantity,
      notes: v.notes,
    }));
  }

  private groupItemNeedsByCategory(
    rows: ItemNeedRow[],
  ): ItemNeedsByCategoryGroup[] {
    const map = new Map<string, ItemNeedsByCategoryGroup>();
    for (const row of rows) {
      const item = row.aidCategoryItem;
      const cat = item?.aidCategory;
      if (!item || !cat) continue;
      let bucket = map.get(cat.id);
      if (!bucket) {
        bucket = { category: cat, needs: [] };
        map.set(cat.id, bucket);
      }
      bucket.needs.push({
        id: row.id,
        needed: row.needed,
        quantity: row.quantity,
        notes: row.notes,
        aidCategoryItem: item,
      });
    }
    for (const b of map.values()) {
      b.needs.sort(
        (a, c) =>
          (a.aidCategoryItem.sortOrder ?? 0) -
            (c.aidCategoryItem.sortOrder ?? 0) ||
          a.aidCategoryItem.name.localeCompare(c.aidCategoryItem.name),
      );
    }
    return [...map.values()].sort((a, b) =>
      a.category.name.localeCompare(b.category.name),
    );
  }

  /** Merged `include` shapes (e.g. `get`) widen `itemNeeds`; grouping normalizes at runtime. */
  private withItemNeedsGrouped(
    b: Record<string, unknown> & { itemNeeds?: unknown },
  ) {
    const rows = (
      Array.isArray(b.itemNeeds) ? b.itemNeeds : []
    ) as ItemNeedRow[];
    return {
      ...b,
      itemNeedsByCategory: this.groupItemNeedsByCategory(rows),
    };
  }

  /** `street` API field maps to Prisma `addressLine`. */
  private resolveAddressLineFromInput(
    street?: string | null,
    addressLine?: string | null,
  ): string | null {
    if (street !== undefined && street !== null) {
      const t = typeof street === 'string' ? street.trim() : '';
      return t.length ? t : null;
    }
    if (addressLine !== undefined && addressLine !== null) {
      const t = typeof addressLine === 'string' ? addressLine.trim() : '';
      return t.length ? t : null;
    }
    return null;
  }

  private withStreetSerialized<T extends Record<string, unknown>>(
    b: T,
  ): T & { street: string | null } {
    const line = (b as { addressLine?: string | null }).addressLine;
    return { ...b, street: line ?? null };
  }

  private async ensureCategoryIdsExist(ids: string[]) {
    if (!ids.length) return;
    const found = await this.prisma.aidCategory.count({
      where: { id: { in: ids } },
    });
    if (found !== ids.length)
      throw new BadRequestException('فئة مساعدة غير صالحة');
  }

  private async ensureAidCategoryItemIdsExist(ids: string[]) {
    if (!ids.length) return;
    const found = await this.prisma.aidCategoryItem.count({
      where: { id: { in: ids } },
    });
    if (found !== ids.length)
      throw new BadRequestException('بند فئة مساعدة غير صالح');
  }

  private normalizeBeneficiaryStatus(
    raw?: string,
  ): BeneficiaryStatus | undefined {
    if (raw === undefined || raw === null || String(raw).trim() === '')
      return undefined;
    const v = String(raw).trim() as BeneficiaryStatus;
    if (!Object.values(BeneficiaryStatus).includes(v)) {
      throw new BadRequestException(`Invalid beneficiary status: ${raw}`);
    }
    return v;
  }

  async list(query: {
    q?: string;
    status?: BeneficiaryStatus | string;
    regionId?: string;
  }) {
    const where: Prisma.BeneficiaryWhereInput = { deletedAt: null };
    const status = this.normalizeBeneficiaryStatus(
      query.status as string | undefined,
    );
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
        { addressLine: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.beneficiary.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: this.beneficiaryListInclude(),
    });
    return rows.map((b) => this.withStreetSerialized(b));
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
            createdBy: {
              select: { id: true, displayName: true, username: true },
            },
            completedBy: { select: { id: true, displayName: true } },
          },
        },
        timelineEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!b) throw new NotFoundException();
    return this.withStreetSerialized(this.withItemNeedsGrouped(b));
  }

  async create(actorId: string, dto: CreateBeneficiaryDto) {
    const {
      categoryNeeds,
      categoryIds,
      itemNeeds,
      needs,
      street,
      addressLine,
      ...rest
    } = dto;
    const catNeeds = this.normalizeCategoryNeeds(categoryNeeds, categoryIds);
    const itemNeedRows = this.normalizeItemNeeds(itemNeeds ?? needs);
    await this.ensureCategoryIdsExist(catNeeds.map((n) => n.categoryId));
    await this.ensureAidCategoryItemIdsExist(
      itemNeedRows.map((n) => n.aidCategoryItemId),
    );

    const beneficiary = await this.prisma.$transaction(async (tx) => {
      const b = await tx.beneficiary.create({
        data: {
          fullName: rest.fullName,
          phone:
            typeof rest.phone === 'string' && rest.phone.trim().length >= 3
              ? rest.phone.trim()
              : BENEFICIARY_PHONE_NOT_PROVIDED,
          regionId: rest.regionId ?? null,
          district: rest.district ?? null,
          area: rest.area,
          addressLine: this.resolveAddressLineFromInput(street, addressLine),
          familyCount: rest.familyCount,
          cookingStove: rest.cookingStove ?? false,
          notes: rest.notes ?? null,
          medicalNotes: rest.medicalNotes ?? null,
          deliveryNotes: rest.deliveryNotes ?? null,
          status: rest.status ?? BeneficiaryStatus.ACTIVE,
        },
      });
      if (catNeeds.length) {
        await tx.beneficiaryCategory.createMany({
          data: catNeeds.map((n) => ({
            beneficiaryId: b.id,
            categoryId: n.categoryId,
            quantity: n.quantity,
            notes: n.notes,
          })),
        });
      }
      if (itemNeedRows.length) {
        await tx.beneficiaryItemNeed.createMany({
          data: itemNeedRows.map((r) => ({
            beneficiaryId: b.id,
            aidCategoryItemId: r.aidCategoryItemId,
            needed: r.needed,
            quantity: r.quantity,
            notes: r.notes,
          })),
        });
      }
      return tx.beneficiary.findFirst({
        where: { id: b.id },
        include: this.beneficiaryInclude(),
      });
    });
    if (!beneficiary) throw new NotFoundException();

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
    return this.withStreetSerialized(this.withItemNeedsGrouped(beneficiary));
  }

  async update(actorId: string, id: string, dto: UpdateBeneficiaryDto) {
    const existing = await this.ensure(id);
    const {
      categoryNeeds,
      categoryIds,
      itemNeeds,
      needs,
      regionId,
      street,
      addressLine,
      ...scalar
    } = dto;
    const replaceCategories =
      dto.categoryNeeds !== undefined || dto.categoryIds !== undefined;
    const replaceItemNeeds =
      dto.itemNeeds !== undefined || dto.needs !== undefined;
    const catNeeds = replaceCategories
      ? this.normalizeCategoryNeeds(categoryNeeds, categoryIds)
      : null;
    const itemNeedPayload = dto.itemNeeds !== undefined ? itemNeeds : needs;
    const itemNeedRows = replaceItemNeeds
      ? this.normalizeItemNeeds(itemNeedPayload)
      : null;
    if (replaceCategories)
      await this.ensureCategoryIdsExist(catNeeds!.map((n) => n.categoryId));
    if (replaceItemNeeds)
      await this.ensureAidCategoryItemIdsExist(
        itemNeedRows!.map((n) => n.aidCategoryItemId),
      );

    const data: Prisma.BeneficiaryUpdateInput = {};
    if (scalar.fullName !== undefined) data.fullName = scalar.fullName;
    if (scalar.phone !== undefined) {
      const p = typeof scalar.phone === 'string' ? scalar.phone.trim() : '';
      data.phone = p.length >= 3 ? p : BENEFICIARY_PHONE_NOT_PROVIDED;
    }
    if (scalar.district !== undefined) data.district = scalar.district;
    if (scalar.area !== undefined) {
      const t = String(scalar.area).trim();
      if (!isAllowedBeneficiaryArea(t) && t !== (existing.area ?? '').trim()) {
        throw new BadRequestException('الحي غير صالح');
      }
      data.area = t;
    }
    if (street !== undefined || addressLine !== undefined) {
      data.addressLine = this.resolveAddressLineFromInput(
        street !== undefined ? street : undefined,
        addressLine !== undefined ? addressLine : undefined,
      );
    }
    if (scalar.familyCount !== undefined) data.familyCount = scalar.familyCount;
    if (scalar.cookingStove !== undefined)
      data.cookingStove = scalar.cookingStove;
    if (scalar.notes !== undefined) data.notes = scalar.notes;
    if (scalar.medicalNotes !== undefined)
      data.medicalNotes = scalar.medicalNotes;
    if (scalar.deliveryNotes !== undefined)
      data.deliveryNotes = scalar.deliveryNotes;
    if (scalar.status !== undefined) data.status = scalar.status;
    if (regionId !== undefined) {
      if (regionId === null) data.region = { disconnect: true };
      else data.region = { connect: { id: regionId } };
    }

    const beneficiary = await this.prisma.$transaction(async (tx) =>
      tx.beneficiary.update({
        where: { id },
        data: {
          ...data,
          ...(replaceCategories
            ? {
                categories: {
                  deleteMany: {},
                  ...(catNeeds!.length
                    ? {
                        create: catNeeds!.map((n) => ({
                          categoryId: n.categoryId,
                          quantity: n.quantity,
                          notes: n.notes,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
          ...(replaceItemNeeds
            ? {
                itemNeeds: {
                  deleteMany: {},
                  ...(itemNeedRows!.length
                    ? {
                        create: itemNeedRows!.map((r) => ({
                          aidCategoryItemId: r.aidCategoryItemId,
                          needed: r.needed,
                          quantity: r.quantity,
                          notes: r.notes,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        },
        include: this.beneficiaryInclude(),
      }),
    );

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
    return this.withStreetSerialized(this.withItemNeedsGrouped(beneficiary));
  }

  async archive(actorId: string, id: string) {
    await this.ensure(id);
    const open = await this.prisma.distributionRecord.count({
      where: {
        beneficiaryId: id,
        status: {
          in: [DistributionStatus.PENDING, DistributionStatus.ASSIGNED],
        },
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
  async forceArchive(
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
    const cancelled = await this.prisma.distributionRecord.updateMany({
      where: {
        beneficiaryId: id,
        status: {
          in: [DistributionStatus.PENDING, DistributionStatus.ASSIGNED],
        },
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
    const b = await this.prisma.beneficiary.findFirst({
      where: { id, deletedAt: null },
    });
    if (!b) throw new NotFoundException();
    return b;
  }

  /**
   * Validates optional aid filters; throws if IDs are invalid or item does not belong to the given category.
   */
  private async resolveDeliveredHistoryAidFilters(
    aidCategoryId?: string,
    aidCategoryItemId?: string,
  ): Promise<{ categoryId?: string; itemId?: string }> {
    const rawC = aidCategoryId?.trim() || undefined;
    const rawI = aidCategoryItemId?.trim() || undefined;
    if (!rawC && !rawI) return {};
    if (rawI) {
      const item = await this.prisma.aidCategoryItem.findUnique({
        where: { id: rawI },
        select: { id: true, aidCategoryId: true },
      });
      if (!item) throw new BadRequestException('بند فئة مساعدة غير صالح');
      if (rawC && item.aidCategoryId !== rawC) {
        throw new BadRequestException(
          'البند لا ينتمي إلى فئة المساعدة المحددة',
        );
      }
      return { itemId: rawI };
    }
    const n = await this.prisma.aidCategory.count({ where: { id: rawC! } });
    if (!n) throw new BadRequestException('فئة مساعدة غير صالحة');
    return { categoryId: rawC };
  }

  /** Whether a delivered distribution line matches aid category / item filters. */
  private deliveryLineMatchesAid(
    it: {
      aidCategoryId: string;
      aidCategoryItemId: string | null;
      aidCategoryItem?: { aidCategoryId: string } | null;
    },
    categoryId?: string,
    itemId?: string,
  ): boolean {
    if (itemId) return it.aidCategoryItemId === itemId;
    if (categoryId) {
      return (
        it.aidCategoryId === categoryId ||
        it.aidCategoryItem?.aidCategoryId === categoryId
      );
    }
    return true;
  }

  /**
   * Non-deleted beneficiaries with DELIVERED distributions (line-level quantities).
   * Optional `q` filters name/phone/area/district (server-side).
   * Optional `aidCategoryId` / `aidCategoryItemId` restrict to beneficiaries (and lines) with matching delivered stock lines.
   */
  async deliveredHistory(query?: {
    q?: string;
    aidCategoryId?: string;
    aidCategoryItemId?: string;
  }) {
    const { categoryId, itemId } = await this.resolveDeliveredHistoryAidFilters(
      query?.aidCategoryId,
      query?.aidCategoryItemId,
    );
    const qTrim = query?.q?.trim();

    const lineWhere: Prisma.DistributionRecordItemWhereInput | undefined =
      itemId
        ? { aidCategoryItemId: itemId }
        : categoryId
          ? {
              OR: [
                { aidCategoryId: categoryId },
                { aidCategoryItem: { aidCategoryId: categoryId } },
              ],
            }
          : undefined;

    const where: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      ...(qTrim
        ? {
            OR: [
              { fullName: { contains: qTrim, mode: 'insensitive' } },
              { phone: { contains: qTrim, mode: 'insensitive' } },
              { area: { contains: qTrim, mode: 'insensitive' } },
              { district: { contains: qTrim, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(lineWhere
        ? {
            distributions: {
              some: {
                status: DistributionStatus.DELIVERED,
                items: { some: lineWhere },
              },
            },
          }
        : {}),
    };

    const rows = await this.prisma.beneficiary.findMany({
      where,
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

    const filterLines = Boolean(categoryId || itemId);

    return rows.map((b) => {
      const deliveries = b.distributions
        .map((d) => {
          const items = filterLines
            ? d.items.filter((it) =>
                this.deliveryLineMatchesAid(it, categoryId, itemId),
              )
            : d.items;
          if (items.length === 0) return null;
          return {
            id: d.id,
            deliveredAt: d.deliveredAt?.toISOString() ?? null,
            status: d.status,
            driverDisplayName: d.driver?.displayName ?? null,
            driverUsername: d.driver?.username ?? null,
            completedByDisplayName: d.completedBy?.displayName ?? null,
            lines: items.map((it) => ({
              itemName: this.lineItemDisplayName(it),
              quantity: this.lineDeliveredQuantity(it),
            })),
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      const lastDeliveredAt = deliveries[0]?.deliveredAt ?? null;

      return {
        id: b.id,
        fullName: b.fullName,
        phone: b.phone,
        area: b.area,
        familyCount: b.familyCount,
        totalDeliveredDistributions: deliveries.length,
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

  private lineDeliveredQuantity(it: {
    quantityDelivered: number;
    quantityPlanned: number;
  }): number {
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
    const header = [
      'الاسم',
      'الهاتف',
      'المنطقة',
      'القضاء',
      'الحي',
      'الشارع',
      'عدد الأفراد',
      'الحالة',
      'ملاحظات',
    ];
    const lines = rows.map((r) =>
      [
        r.fullName,
        r.phone,
        r.region?.nameAr ?? '',
        r.district ?? '',
        r.area ?? '',
        r.addressLine ?? '',
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
