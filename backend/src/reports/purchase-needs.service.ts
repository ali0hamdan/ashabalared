import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AidCategoryQuantityMode,
  BeneficiaryStatus,
  RoleCode,
  StockUnit,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { parseIncludeInactive } from '../beneficiaries/constants/beneficiary-list-query';
import { buildCsvDocument } from '../common/csv';

export type PurchaseNeedsBeneficiaryRow = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  street: string | null;
  quantity: number | null;
  quantityLabel: string;
  notes: string | null;
};

export const PURCHASE_NEEDS_CATEGORY_TOTAL_LABEL = 'Category total';

export type PurchaseNeedsItemRow = {
  type: 'ITEM';
  aidCategoryItemId: string;
  itemName: string;
  unit: StockUnit;
  totalNeeded: number;
  totalNeededLabel: string;
  hasUnspecifiedQuantity: boolean;
  currentStock: number;
  needToBuy: number;
  beneficiariesCount: number;
  beneficiaries: PurchaseNeedsBeneficiaryRow[];
};

/** Category-level need row (for CATEGORY_LEVEL categories: one total per category). */
export type PurchaseNeedsCategoryNeedRow = {
  type: 'CATEGORY';
  label: string;
  totalNeeded: number;
  totalNeededLabel: string;
  hasUnspecifiedQuantity: boolean;
  /** Category-level purchase need (no per-item stock matching). */
  needToBuy: number;
  beneficiariesCount: number;
  beneficiaries: PurchaseNeedsBeneficiaryRow[];
  helperText: string;
};

export type PurchaseNeedsCategoryRow = {
  aidCategoryId: string;
  aidCategoryName: string;
  quantityMode: AidCategoryQuantityMode;
  items: PurchaseNeedsItemRow[];
  /** Present only for CATEGORY_LEVEL categories. */
  categoryNeed: PurchaseNeedsCategoryNeedRow | null;
};

export type PurchaseNeedsResponse = {
  categories: PurchaseNeedsCategoryRow[];
};

type BeneficiaryNeedSource = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  addressLine: string | null;
  categories: Array<{
    categoryId: string;
    quantity: number;
    notes: string | null;
  }>;
  itemNeeds: Array<{
    needed: boolean;
    quantity: number;
    notes: string | null;
    aidCategoryItemId: string;
    aidCategoryItem: {
      id: string;
      aidCategoryId: string;
      name: string;
      unit: StockUnit;
    };
  }>;
};

type ItemAccumulator = {
  aidCategoryItemId: string;
  itemName: string;
  unit: StockUnit;
  currentStock: number;
  totalNeeded: number;
  hasUnspecified: boolean;
  beneficiaries: PurchaseNeedsBeneficiaryRow[];
};

@Injectable()
export class PurchaseNeedsService {
  constructor(private readonly prisma: PrismaService) {}

  private isRealCategoryNeed(c: {
    quantity?: number;
    notes?: string | null;
  }): boolean {
    const q = c.quantity ?? 0;
    const note = c.notes?.trim() ?? '';
    return q >= 1 || note.length > 0;
  }

  private isRealItemNeed(n: {
    needed: boolean;
    quantity?: number;
    notes?: string | null;
  }): boolean {
    if (!n.needed) return false;
    const q = n.quantity ?? 0;
    const note = n.notes?.trim() ?? '';
    return q >= 1 || note.length > 0;
  }

  private resolveItemQuantity(itemNeed: {
    quantity: number;
    notes: string | null;
  }): { quantity: number | null; label: string } {
    const q = itemNeed.quantity ?? 0;
    if (q >= 1) {
      return { quantity: q, label: String(q) };
    }
    return { quantity: null, label: 'No quantity specified' };
  }

  private parseSort(
    sortBy?: string,
    sortDirection?: string,
  ): {
    field: 'categoryName' | 'itemName' | 'totalNeeded' | 'shortage';
    asc: boolean;
  } {
    const fieldRaw = (sortBy?.trim() || 'shortage').toLowerCase();
    const dirRaw = (sortDirection?.trim() || 'desc').toLowerCase();
    const allowed = ['categoryname', 'itemname', 'totalneeded', 'shortage'];
    if (!allowed.includes(fieldRaw)) {
      throw new BadRequestException(
        'sortBy must be categoryName, itemName, totalNeeded, or shortage',
      );
    }
    if (!['asc', 'desc'].includes(dirRaw)) {
      throw new BadRequestException('sortDirection must be asc or desc');
    }
    const fieldMap = {
      categoryname: 'categoryName',
      itemname: 'itemName',
      totalneeded: 'totalNeeded',
      shortage: 'shortage',
    } as const;
    return {
      field: fieldMap[fieldRaw as keyof typeof fieldMap],
      asc: dirRaw === 'asc',
    };
  }

  private matchesSearch(
    search: string,
    categoryName: string,
    itemName: string,
  ): boolean {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      categoryName.toLowerCase().includes(q) ||
      itemName.toLowerCase().includes(q)
    );
  }

  private sortItems(
    items: PurchaseNeedsItemRow[],
    field: 'categoryName' | 'itemName' | 'totalNeeded' | 'shortage',
    asc: boolean,
  ): PurchaseNeedsItemRow[] {
    return [...items].sort((a, b) => {
      let cmp = 0;
      if (field === 'categoryName' || field === 'itemName') {
        cmp = a.itemName.localeCompare(b.itemName);
      } else if (field === 'totalNeeded') {
        cmp = a.totalNeeded - b.totalNeeded;
      } else {
        cmp = a.needToBuy - b.needToBuy;
      }
      return asc ? cmp : -cmp;
    });
  }

  async getPurchaseNeeds(
    actor: AuthUser,
    query: {
      aidCategoryId?: string;
      search?: string;
      includeInactive?: string;
      sortBy?: string;
      sortDirection?: string;
    },
  ): Promise<PurchaseNeedsResponse> {
    const includeInactive =
      (actor.roleCode === RoleCode.SUPER_ADMIN ||
        actor.roleCode === RoleCode.ADMIN) &&
      parseIncludeInactive(query.includeInactive);

    const categoryId = query.aidCategoryId?.trim() || undefined;
    const search = query.search?.trim() || '';
    const { field, asc } = this.parseSort(query.sortBy, query.sortDirection);

    const [catalog, beneficiaries] = await Promise.all([
      this.prisma.aidCategory.findMany({
        where: categoryId ? { id: categoryId } : undefined,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          quantityMode: true,
          items: {
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              unit: true,
              stockItem: { select: { quantityOnHand: true } },
            },
          },
        },
      }),
      this.prisma.beneficiary.findMany({
        where: {
          deletedAt: null,
          status: includeInactive
            ? { in: [BeneficiaryStatus.ACTIVE, BeneficiaryStatus.INACTIVE] }
            : BeneficiaryStatus.ACTIVE,
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          area: true,
          addressLine: true,
          categories: {
            select: {
              categoryId: true,
              quantity: true,
              notes: true,
            },
          },
          itemNeeds: {
            where: { needed: true },
            select: {
              needed: true,
              quantity: true,
              notes: true,
              aidCategoryItemId: true,
              aidCategoryItem: {
                select: {
                  id: true,
                  aidCategoryId: true,
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const categories: PurchaseNeedsCategoryRow[] = [];

    for (const cat of catalog) {
      // CATEGORY_LEVEL: quantity comes from beneficiary category needs (one total per category).
      if (cat.quantityMode === AidCategoryQuantityMode.CATEGORY_LEVEL) {
        let categoryTotal = 0;
        let categoryUnspecified = false;
        const categoryBeneficiaries: PurchaseNeedsBeneficiaryRow[] = [];

        for (const b of beneficiaries as BeneficiaryNeedSource[]) {
          const catNeed = b.categories.find((c) => c.categoryId === cat.id);
          if (!catNeed || !this.isRealCategoryNeed(catNeed)) continue;

          const catQ = catNeed.quantity ?? 0;
          const catNote = catNeed.notes?.trim() ?? '';
          if (catQ >= 1) {
            categoryTotal += catQ;
          } else {
            categoryUnspecified = true;
          }
          categoryBeneficiaries.push({
            id: b.id,
            fullName: b.fullName,
            phone: b.phone,
            area: b.area,
            street: b.addressLine?.trim() || null,
            quantity: catQ >= 1 ? catQ : null,
            quantityLabel: catQ >= 1 ? String(catQ) : 'No quantity specified',
            notes: catNote || null,
          });
        }

        if (categoryBeneficiaries.length === 0) continue;
        if (
          search &&
          !this.matchesSearch(
            search,
            cat.name,
            PURCHASE_NEEDS_CATEGORY_TOTAL_LABEL,
          )
        ) {
          continue;
        }

        categories.push({
          aidCategoryId: cat.id,
          aidCategoryName: cat.name,
          quantityMode: cat.quantityMode,
          items: [],
          categoryNeed: {
            type: 'CATEGORY',
            label: PURCHASE_NEEDS_CATEGORY_TOTAL_LABEL,
            totalNeeded: categoryTotal,
            totalNeededLabel: categoryUnspecified
              ? categoryTotal > 0
                ? `${categoryTotal} + no qty`
                : 'No quantity specified'
              : String(categoryTotal),
            hasUnspecifiedQuantity: categoryUnspecified,
            needToBuy: categoryTotal,
            beneficiariesCount: categoryBeneficiaries.length,
            beneficiaries: categoryBeneficiaries,
            helperText: 'Category-level quantity',
          },
        });
        continue;
      }

      // ITEM_LEVEL: quantity comes from per-item needs.
      const itemAccum = new Map<string, ItemAccumulator>();
      for (const item of cat.items) {
        itemAccum.set(item.id, {
          aidCategoryItemId: item.id,
          itemName: item.name,
          unit: item.unit,
          currentStock: item.stockItem?.quantityOnHand ?? 0,
          totalNeeded: 0,
          hasUnspecified: false,
          beneficiaries: [],
        });
      }

      for (const b of beneficiaries as BeneficiaryNeedSource[]) {
        const realItemNeedsInCat = b.itemNeeds.filter(
          (n) =>
            n.aidCategoryItem.aidCategoryId === cat.id &&
            this.isRealItemNeed(n),
        );

        for (const n of realItemNeedsInCat) {
          const acc = itemAccum.get(n.aidCategoryItem.id);
          if (!acc) continue;

          const resolved = this.resolveItemQuantity({
            quantity: n.quantity,
            notes: n.notes,
          });

          if (resolved.quantity === null) {
            acc.hasUnspecified = true;
          } else {
            acc.totalNeeded += resolved.quantity;
          }

          acc.beneficiaries.push({
            id: b.id,
            fullName: b.fullName,
            phone: b.phone,
            area: b.area,
            street: b.addressLine?.trim() || null,
            quantity: resolved.quantity,
            quantityLabel: resolved.label,
            notes: n.notes?.trim() || null,
          });
        }
      }

      const items: PurchaseNeedsItemRow[] = [];

      for (const acc of itemAccum.values()) {
        if (acc.beneficiaries.length === 0) continue;

        const needToBuy = Math.max(acc.totalNeeded - acc.currentStock, 0);
        const row: PurchaseNeedsItemRow = {
          type: 'ITEM',
          aidCategoryItemId: acc.aidCategoryItemId,
          itemName: acc.itemName,
          unit: acc.unit,
          totalNeeded: acc.totalNeeded,
          totalNeededLabel: acc.hasUnspecified
            ? acc.totalNeeded > 0
              ? `${acc.totalNeeded} + no qty`
              : 'No quantity specified'
            : String(acc.totalNeeded),
          hasUnspecifiedQuantity: acc.hasUnspecified,
          currentStock: acc.currentStock,
          needToBuy,
          beneficiariesCount: acc.beneficiaries.length,
          beneficiaries: acc.beneficiaries,
        };

        if (search && !this.matchesSearch(search, cat.name, row.itemName)) {
          continue;
        }

        items.push(row);
      }

      const filteredItems = items.filter((row) => row.beneficiariesCount > 0);
      if (filteredItems.length === 0) continue;

      categories.push({
        aidCategoryId: cat.id,
        aidCategoryName: cat.name,
        quantityMode: cat.quantityMode,
        items: this.sortItems(filteredItems, field, asc),
        categoryNeed: null,
      });
    }

    if (field === 'categoryName') {
      categories.sort((a, b) => {
        const cmp = a.aidCategoryName.localeCompare(b.aidCategoryName);
        return asc ? cmp : -cmp;
      });
    }

    return { categories };
  }

  async exportPurchaseNeedsCsv(
    actor: AuthUser,
    query: {
      aidCategoryId?: string;
      search?: string;
      includeInactive?: string;
      sortBy?: string;
      sortDirection?: string;
    },
  ): Promise<{ csv: string; filename: string }> {
    const { categories } = await this.getPurchaseNeeds(actor, query);

    const header = [
      'Aid Category',
      'Item',
      'Unit',
      'Total needed',
      'Total needed label',
      'Current stock',
      'Need to buy',
      'Beneficiaries count',
      'Beneficiary name',
      'Phone',
      'Area',
      'Street',
      'Quantity',
      'Quantity label',
      'Notes',
    ];

    const pushDetailRows = (
      catName: string,
      itemName: string,
      unit: string,
      totalNeeded: number,
      totalLabel: string,
      stock: string,
      buy: string,
      count: number,
      beneficiaries: PurchaseNeedsBeneficiaryRow[],
    ) => {
      if (beneficiaries.length === 0) {
        rows.push([
          catName,
          itemName,
          unit,
          totalNeeded,
          totalLabel,
          stock,
          buy,
          count,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ]);
        return;
      }
      for (const ben of beneficiaries) {
        rows.push([
          catName,
          itemName,
          unit,
          totalNeeded,
          totalLabel,
          stock,
          buy,
          count,
          ben.fullName,
          ben.phone,
          ben.area ?? '',
          ben.street ?? '',
          ben.quantity ?? '',
          ben.quantityLabel,
          ben.notes ?? '',
        ]);
      }
    };

    const rows: unknown[][] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        pushDetailRows(
          cat.aidCategoryName,
          item.itemName,
          item.unit,
          item.totalNeeded,
          item.totalNeededLabel,
          String(item.currentStock),
          String(item.needToBuy),
          item.beneficiariesCount,
          item.beneficiaries,
        );
      }
      if (cat.categoryNeed) {
        const u = cat.categoryNeed;
        pushDetailRows(
          cat.aidCategoryName,
          cat.aidCategoryName,
          '',
          u.totalNeeded,
          u.totalNeededLabel,
          '—',
          String(u.needToBuy),
          u.beneficiariesCount,
          u.beneficiaries,
        );
      }
    }

    const datePart = new Date().toISOString().slice(0, 10);
    const catPart = query.aidCategoryId?.trim()
      ? query.aidCategoryId.trim().slice(-12)
      : 'all-categories';
    const filename = `purchase-needs-${catPart}-${datePart}.csv`;

    return { csv: buildCsvDocument(header, rows), filename };
  }
}
