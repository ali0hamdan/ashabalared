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
import { LEBANESE_LOCAL_PHONE_REGEX } from './constants/lebanese-phone';
import type { DuplicateMatchReason } from './constants/duplicate-beneficiary';
import {
  areasEqualCaseInsensitive,
  namesSimilar,
  sortDuplicateMatches,
  streetSearchToken,
  streetsSimilar,
} from './constants/duplicate-beneficiary';
import { isFoodRationsCategoryName } from './constants/food-rations-category';
import {
  beneficiaryStatusSortRank,
  parseForSelection,
  parseIncludeInactive,
} from './constants/beneficiary-list-query';
import type { BeneficiaryCategoryNeedDto } from './dto/beneficiary-category-need.dto';
import type { BeneficiaryItemNeedDto } from './dto/beneficiary-item-need.dto';
import {
  buildPaginatedResult,
  parseBoolQuery,
  parsePaginationQuery,
  type PaginatedResult,
} from '../common/pagination';

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

  /** Remove beneficiary category + item needs tied to food-rations aid categories (when Can cook is false). */
  private async removeFoodRationsBeneficiaryNeeds(
    tx: Prisma.TransactionClient,
    beneficiaryId: string,
  ): Promise<void> {
    const foodCats = await tx.aidCategory.findMany({
      select: { id: true, name: true },
    });
    const foodCategoryIds = foodCats
      .filter((c) => isFoodRationsCategoryName(c.name))
      .map((c) => c.id);
    if (!foodCategoryIds.length) return;

    await tx.beneficiaryCategory.deleteMany({
      where: {
        beneficiaryId,
        categoryId: { in: foodCategoryIds },
      },
    });

    const foodItems = await tx.aidCategoryItem.findMany({
      where: { aidCategoryId: { in: foodCategoryIds } },
      select: { id: true },
    });
    const foodItemIds = foodItems.map((i) => i.id);
    if (!foodItemIds.length) return;

    await tx.beneficiaryItemNeed.deleteMany({
      where: {
        beneficiaryId,
        aidCategoryItemId: { in: foodItemIds },
      },
    });
  }

  /**
   * Food rations require cooking ability; rejects API payloads that select food without Can cook.
   */
  private async assertFoodRationsRequiresCooking(
    canCook: boolean,
    categoryNeeds: { categoryId: string }[],
    itemNeeds: { aidCategoryItemId: string }[],
  ): Promise<void> {
    if (canCook) return;

    const catIds = [...new Set(categoryNeeds.map((n) => n.categoryId).filter(Boolean))];
    const itemIds = [...new Set(itemNeeds.map((n) => n.aidCategoryItemId).filter(Boolean))];

    if (catIds.length) {
      const cats = await this.prisma.aidCategory.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true },
      });
      for (const c of cats) {
        if (isFoodRationsCategoryName(c.name)) {
          throw new BadRequestException(
            'Food rations category requires Can cook to be enabled.',
          );
        }
      }
    }

    if (itemIds.length) {
      const items = await this.prisma.aidCategoryItem.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          aidCategory: { select: { name: true } },
        },
      });
      for (const it of items) {
        if (isFoodRationsCategoryName(it.aidCategory?.name)) {
          throw new BadRequestException(
            'Food rations items require Can cook to be enabled.',
          );
        }
      }
    }
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

  private sortBeneficiaryRowsForList<
    T extends { status: BeneficiaryStatus; updatedAt: Date },
  >(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      const byStatus =
        beneficiaryStatusSortRank(a.status) -
        beneficiaryStatusSortRank(b.status);
      if (byStatus !== 0) return byStatus;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }

  async list(query: {
    q?: string;
    status?: BeneficiaryStatus | string;
    regionId?: string;
    forSelection?: string;
    includeInactive?: string;
    activeOnly?: string;
    page?: string;
    limit?: string;
  }): Promise<
    PaginatedResult<Record<string, unknown> & { street: string | null }>
  > {
    const where: Prisma.BeneficiaryWhereInput = { deletedAt: null };
    const activeOnly = parseBoolQuery(query.activeOnly);

    if (activeOnly) {
      where.status = BeneficiaryStatus.ACTIVE;
    } else {
      const forSelection = parseForSelection(query.forSelection);
      const includeInactive = parseIncludeInactive(query.includeInactive);

      if (forSelection) {
        if (includeInactive) {
          where.status = {
            in: [BeneficiaryStatus.ACTIVE, BeneficiaryStatus.INACTIVE],
          };
        } else {
          where.status = BeneficiaryStatus.ACTIVE;
        }
      } else {
        const status = this.normalizeBeneficiaryStatus(
          query.status as string | undefined,
        );
        if (status) where.status = status;
      }
    }

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
        {
          region: {
            is: {
              OR: [
                { nameAr: { contains: q, mode: 'insensitive' } },
                { nameEn: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const { page, limit, skip } = parsePaginationQuery({
      page: query.page,
      limit: query.limit,
    });

    const orderBy: Prisma.BeneficiaryOrderByWithRelationInput[] = [
      { status: 'asc' },
      { updatedAt: 'desc' },
    ];

    const [total, rows] = await Promise.all([
      this.prisma.beneficiary.count({ where }),
      this.prisma.beneficiary.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.beneficiaryListInclude(),
      }),
    ]);

    const data = rows.map((b) => this.withStreetSerialized(b));
    return buildPaginatedResult(data, total, page, limit);
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

  /**
   * Delivered distributions in the last `days` window, aggregated per aid category (latest delivery per category).
   */
  async getRecentAid(
    id: string,
    query: { days?: string; categoryIds?: string },
  ) {
    await this.ensure(id);

    const rawDays = query.days?.trim();
    const parsed =
      rawDays !== undefined && rawDays !== ''
        ? Number.parseInt(rawDays, 10)
        : 7;
    const days = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 365)
      : 7;

    const filterCatIds = new Set(
      (query.categoryIds?.split(',') ?? [])
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const cutoff = new Date(Date.now() - days * 86_400_000);

    const records = await this.prisma.distributionRecord.findMany({
      where: {
        beneficiaryId: id,
        status: DistributionStatus.DELIVERED,
        OR: [
          { deliveredAt: { gte: cutoff } },
          {
            AND: [{ deliveredAt: null }, { updatedAt: { gte: cutoff } }],
          },
        ],
      },
      include: {
        items: {
          include: {
            aidCategory: { select: { id: true, name: true } },
            aidCategoryItem: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ deliveredAt: 'desc' }, { updatedAt: 'desc' }],
    });

    type Rec = (typeof records)[number];
    type Agg = { lastAt: Date; record: Rec };

    const byCategory = new Map<string, Agg>();

    for (const r of records) {
      const t = r.deliveredAt ?? r.updatedAt;
      if (t < cutoff) continue;
      for (const line of r.items) {
        const cid = line.aidCategoryId;
        if (filterCatIds.size > 0 && !filterCatIds.has(cid)) continue;
        const prev = byCategory.get(cid);
        if (!prev || t > prev.lastAt) {
          byCategory.set(cid, { lastAt: t, record: r });
        }
      }
    }

    const categories = [...byCategory.entries()]
      .map(([aidCategoryId, { lastAt, record }]) => {
        const lines = record.items.filter((l) => l.aidCategoryId === aidCategoryId);
        const name = lines[0]?.aidCategory?.name ?? '';
        return {
          aidCategoryId,
          aidCategoryName: name,
          lastDeliveredAt: lastAt.toISOString(),
          deliveredItems: lines.map((l) => ({
            aidCategoryItemId: l.aidCategoryItemId,
            itemName: l.aidCategoryItem?.name ?? '',
            quantityDelivered: l.quantityDelivered,
          })),
        };
      })
      .sort((a, b) => a.aidCategoryName.localeCompare(b.aidCategoryName));

    return {
      days,
      since: cutoff.toISOString(),
      categories,
    };
  }

  /**
   * Category-level + item-level needs only (no distributions/timeline) for distribution workflow.
   */
  async getNeedsSummary(id: string) {
    await this.ensure(id);

    const [categoryNeeds, itemNeeds] = await Promise.all([
      this.prisma.beneficiaryCategory.findMany({
        where: { beneficiaryId: id },
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.beneficiaryItemNeed.findMany({
        where: { beneficiaryId: id, needed: true },
        include: {
          aidCategoryItem: {
            select: {
              id: true,
              name: true,
              aidCategory: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const catIncluded = categoryNeeds.filter((bc) => {
      const q = bc.quantity ?? 0;
      const note = bc.notes?.trim() ?? '';
      return q >= 1 || note.length > 0;
    });

    const itemIncluded = itemNeeds.filter((it) => {
      const q = it.quantity ?? 0;
      const note = it.notes?.trim() ?? '';
      return q >= 1 || note.length > 0;
    });

    const needs: Array<{
      aidCategoryId: string;
      aidCategoryName: string;
      itemId: string | null;
      itemName: string | null;
      quantity: number;
      notes: string | null;
    }> = [];

    for (const bc of catIncluded) {
      needs.push({
        aidCategoryId: bc.categoryId,
        aidCategoryName: bc.category.name,
        itemId: null,
        itemName: null,
        quantity: Math.max(0, bc.quantity ?? 0),
        notes: bc.notes?.trim() ? bc.notes.trim() : null,
      });
    }

    for (const it of itemIncluded) {
      const item = it.aidCategoryItem;
      const cat = item.aidCategory;
      needs.push({
        aidCategoryId: cat.id,
        aidCategoryName: cat.name,
        itemId: item.id,
        itemName: item.name,
        quantity: Math.max(0, it.quantity ?? 0),
        notes: it.notes?.trim() ? it.notes.trim() : null,
      });
    }

    needs.sort((a, b) => {
      const byCat = a.aidCategoryName.localeCompare(b.aidCategoryName);
      if (byCat !== 0) return byCat;
      const ai = a.itemName ?? '';
      const bi = b.itemName ?? '';
      return ai.localeCompare(bi);
    });

    return { needs };
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
    const canCook = rest.cookingStove ?? false;
    await this.assertFoodRationsRequiresCooking(canCook, catNeeds, itemNeedRows);
    await this.ensureCategoryIdsExist(catNeeds.map((n) => n.categoryId));
    await this.ensureAidCategoryItemIdsExist(
      itemNeedRows.map((n) => n.aidCategoryItemId),
    );

    const beneficiary = await this.prisma.$transaction(async (tx) => {
      const b = await tx.beneficiary.create({
        data: {
          fullName: rest.fullName,
          phone:
            typeof rest.phone === 'string' &&
            LEBANESE_LOCAL_PHONE_REGEX.test(rest.phone.trim())
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

    const nextCooking =
      dto.cookingStove !== undefined ? dto.cookingStove : existing.cookingStove;
    if (replaceCategories && catNeeds) {
      await this.assertFoodRationsRequiresCooking(nextCooking, catNeeds, []);
    }
    if (replaceItemNeeds && itemNeedRows) {
      await this.assertFoodRationsRequiresCooking(nextCooking, [], itemNeedRows);
    }

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
      if (p === '') data.phone = BENEFICIARY_PHONE_NOT_PROVIDED;
      else if (LEBANESE_LOCAL_PHONE_REGEX.test(p)) data.phone = p;
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

    const beneficiary = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.beneficiary.update({
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
      });

      const finalCooking = updated.cookingStove;
      if (finalCooking === false) {
        await this.removeFoodRationsBeneficiaryNeeds(tx, id);
      }

      const out = await tx.beneficiary.findFirst({
        where: { id },
        include: this.beneficiaryInclude(),
      });
      if (!out) throw new NotFoundException();
      return out;
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
    includeInactive?: string;
    page?: string;
    limit?: string;
  }): Promise<PaginatedResult<Record<string, unknown>>> {
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

    const includeInactive = parseIncludeInactive(query?.includeInactive);

    const where: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      status: includeInactive
        ? { in: [BeneficiaryStatus.ACTIVE, BeneficiaryStatus.INACTIVE] }
        : BeneficiaryStatus.ACTIVE,
      ...(qTrim
        ? {
            OR: [
              { fullName: { contains: qTrim, mode: 'insensitive' } },
              { phone: { contains: qTrim, mode: 'insensitive' } },
              { area: { contains: qTrim, mode: 'insensitive' } },
              { district: { contains: qTrim, mode: 'insensitive' } },
              { addressLine: { contains: qTrim, mode: 'insensitive' } },
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

    const { page, limit, skip } = parsePaginationQuery({
      page: query?.page,
      limit: query?.limit,
    });

    const orderBy: Prisma.BeneficiaryOrderByWithRelationInput[] = [
      { status: 'asc' },
      { fullName: 'asc' },
    ];

    const historyDistInclude = {
      where: { status: DistributionStatus.DELIVERED },
      orderBy: { deliveredAt: 'desc' as const },
      include: {
        items: {
          include: {
            aidCategory: { select: { id: true, name: true } },
            aidCategoryItem: {
              select: {
                id: true,
                name: true,
                aidCategoryId: true,
                aidCategory: { select: { id: true, name: true } },
              },
            },
            stockItem: {
              select: {
                aidCategoryItem: {
                  select: {
                    name: true,
                    aidCategory: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        driver: { select: { id: true, displayName: true, username: true } },
        completedBy: { select: { id: true, displayName: true } },
      },
    };

    const [total, rows] = await Promise.all([
      this.prisma.beneficiary.count({ where }),
      this.prisma.beneficiary.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          distributions: historyDistInclude,
        },
      }),
    ]);

    const filterLines = Boolean(categoryId || itemId);

    const mapped = rows.map((b) => {
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
        status: b.status,
        totalDeliveredDistributions: deliveries.length,
        lastDeliveredAt,
        deliveries,
      };
    });

    return buildPaginatedResult(mapped, total, page, limit);
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

  async duplicateCheck(params: {
    fullName?: string;
    phone?: string;
    area?: string;
    street?: string;
    excludeId?: string;
  }): Promise<{
    matches: Array<{
      id: string;
      fullName: string;
      phone: string;
      area: string | null;
      street: string | null;
      status: BeneficiaryStatus;
      matchReasons: DuplicateMatchReason[];
    }>;
    hasExactPhoneDuplicate: boolean;
  }> {
    const excludeId = params.excludeId?.trim();
    const baseWhere: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };

    const select = {
      id: true,
      fullName: true,
      phone: true,
      area: true,
      addressLine: true,
      status: true,
    } as const;

    type DupRow = Prisma.BeneficiaryGetPayload<{ select: typeof select }>;
    const acc = new Map<string, { row: DupRow; reasons: Set<DuplicateMatchReason> }>();

    const add = (row: DupRow, reason: DuplicateMatchReason) => {
      const prev = acc.get(row.id);
      if (prev) {
        prev.reasons.add(reason);
      } else {
        acc.set(row.id, { row, reasons: new Set([reason]) });
      }
    };

    const phoneDigits = params.phone?.trim() ?? '';
    if (phoneDigits.length > 0 && LEBANESE_LOCAL_PHONE_REGEX.test(phoneDigits)) {
      const byPhone = await this.prisma.beneficiary.findMany({
        where: { ...baseWhere, phone: phoneDigits },
        select,
        take: 10,
      });
      for (const row of byPhone) {
        add(row, 'PHONE_EXACT');
      }
    }

    const fullNameTrim = params.fullName?.trim() ?? '';
    const areaTrim = params.area?.trim() ?? '';
    const streetTrim = params.street?.trim() ?? '';

    if (fullNameTrim.length >= 2 && areaTrim.length > 0 && isAllowedBeneficiaryArea(areaTrim)) {
      const inArea = await this.prisma.beneficiary.findMany({
        where: {
          ...baseWhere,
          area: { equals: areaTrim, mode: 'insensitive' },
        },
        select,
        take: 150,
      });
      for (const row of inArea) {
        if (namesSimilar(fullNameTrim, row.fullName)) {
          add(row, 'NAME_AREA_SIMILAR');
        }
      }
    }

    if (fullNameTrim.length >= 2 && streetTrim.length >= 3) {
      const token = streetSearchToken(streetTrim);
      if (token) {
        const streetWhere: Prisma.BeneficiaryWhereInput = {
          ...baseWhere,
          addressLine: { contains: token, mode: 'insensitive' },
        };
        if (areaTrim.length > 0 && isAllowedBeneficiaryArea(areaTrim)) {
          streetWhere.area = { equals: areaTrim, mode: 'insensitive' };
        }

        const streetCandidates = await this.prisma.beneficiary.findMany({
          where: streetWhere,
          select,
          take: 80,
        });

        for (const row of streetCandidates) {
          const addr = row.addressLine ?? '';
          if (!namesSimilar(fullNameTrim, row.fullName) || !streetsSimilar(streetTrim, addr)) {
            continue;
          }
          if (areaTrim.length > 0 && isAllowedBeneficiaryArea(areaTrim)) {
            if (!row.area || !areasEqualCaseInsensitive(areaTrim, row.area)) {
              continue;
            }
          }
          add(row, 'NAME_STREET_SIMILAR');
        }
      }
    }

    const merged = [...acc.values()].map(({ row, reasons }) => ({
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      area: row.area,
      street: row.addressLine ?? null,
      status: row.status,
      matchReasons: [...reasons],
    }));

    const hasExactPhoneDuplicate = merged.some((m) =>
      m.matchReasons.includes('PHONE_EXACT'),
    );
    const sorted = sortDuplicateMatches(merged, 10);

    return { matches: sorted, hasExactPhoneDuplicate };
  }

  async exportCsv() {
    const rows = await this.prisma.beneficiary.findMany({
      where: { deletedAt: null },
      include: { region: true },
      orderBy: { updatedAt: 'desc' },
    });
    const sorted = this.sortBeneficiaryRowsForList(rows);
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
    const lines = sorted.map((r) =>
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
