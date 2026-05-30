import { BadRequestException, Injectable } from '@nestjs/common';
import { BeneficiaryStatus, RoleCode, StockUnit } from '@prisma/client';
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

export type PurchaseNeedsItemRow = {
  aidCategoryItemId: string | null;
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

export type PurchaseNeedsCategoryRow = {
  aidCategoryId: string;
  aidCategoryName: string;
  items: PurchaseNeedsItemRow[];
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

  private resolveItemQuantity(
    itemNeed: { quantity: number; notes: string | null },
    categoryNeed?: { quantity: number; notes: string | null },
  ): { quantity: number | null; label: string } {
    const q = itemNeed.quantity ?? 0;
    const itemNote = itemNeed.notes?.trim() ?? '';
    if (q >= 1) {
      return { quantity: q, label: String(q) };
    }
    if (itemNote) {
      return {
        quantity: null,
        label: 'Needed, no quantity specified',
      };
    }
    if (categoryNeed && this.isRealCategoryNeed(categoryNeed)) {
      const catQ = categoryNeed.quantity ?? 0;
      if (catQ >= 1) {
        return { quantity: catQ, label: String(catQ) };
      }
      const catNote = categoryNeed.notes?.trim() ?? '';
      if (catNote) {
        return {
          quantity: null,
          label: 'Needed, no quantity specified',
        };
      }
    }
    return { quantity: null, label: 'Needed, no quantity specified' };
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

      let categoryOnlyTotal = 0;
      let categoryOnlyUnspecified = false;
      const categoryOnlyBeneficiaries: PurchaseNeedsBeneficiaryRow[] = [];

      for (const b of beneficiaries as BeneficiaryNeedSource[]) {
        const catNeed = b.categories.find((c) => c.categoryId === cat.id);
        const catNeedReal = catNeed && this.isRealCategoryNeed(catNeed);

        const realItemNeedsInCat = b.itemNeeds.filter(
          (n) =>
            n.aidCategoryItem.aidCategoryId === cat.id &&
            this.isRealItemNeed(n),
        );

        for (const n of realItemNeedsInCat) {
          const acc = itemAccum.get(n.aidCategoryItem.id);
          if (!acc) continue;

          const resolved = this.resolveItemQuantity(
            { quantity: n.quantity, notes: n.notes },
            catNeedReal ? catNeed : undefined,
          );

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
            notes: n.notes?.trim() || catNeed?.notes?.trim() || null,
          });
        }

        if (catNeedReal && realItemNeedsInCat.length === 0) {
          const catQ = catNeed!.quantity ?? 0;
          const catNote = catNeed!.notes?.trim() ?? '';
          if (catQ >= 1) {
            categoryOnlyTotal += catQ;
          } else {
            categoryOnlyUnspecified = true;
          }
          categoryOnlyBeneficiaries.push({
            id: b.id,
            fullName: b.fullName,
            phone: b.phone,
            area: b.area,
            street: b.addressLine?.trim() || null,
            quantity: catQ >= 1 ? catQ : null,
            quantityLabel:
              catQ >= 1
                ? String(catQ)
                : 'Needed, no quantity specified',
            notes: catNote || null,
          });
        }
      }

      const items: PurchaseNeedsItemRow[] = [];

      for (const acc of itemAccum.values()) {
        if (acc.beneficiaries.length === 0) continue;

        const needToBuy = Math.max(acc.totalNeeded - acc.currentStock, 0);
        const row: PurchaseNeedsItemRow = {
          aidCategoryItemId: acc.aidCategoryItemId,
          itemName: acc.itemName,
          unit: acc.unit,
          totalNeeded: acc.totalNeeded,
          totalNeededLabel: acc.hasUnspecified
            ? acc.totalNeeded > 0
              ? `${acc.totalNeeded} + unspecified`
              : 'Needed, no quantity specified'
            : String(acc.totalNeeded),
          hasUnspecifiedQuantity: acc.hasUnspecified,
          currentStock: acc.currentStock,
          needToBuy,
          beneficiariesCount: acc.beneficiaries.length,
          beneficiaries: acc.beneficiaries,
        };

        if (
          search &&
          !this.matchesSearch(search, cat.name, row.itemName)
        ) {
          continue;
        }

        items.push(row);
      }

      if (categoryOnlyBeneficiaries.length > 0) {
        const catOnlyName = '(Category-level need)';
        if (!search || this.matchesSearch(search, cat.name, catOnlyName)) {
          const currentStock = 0;
          const needToBuy = Math.max(categoryOnlyTotal - currentStock, 0);
          items.push({
            aidCategoryItemId: null,
            itemName: catOnlyName,
            unit: StockUnit.PIECE,
            totalNeeded: categoryOnlyTotal,
            totalNeededLabel: categoryOnlyUnspecified
              ? categoryOnlyTotal > 0
                ? `${categoryOnlyTotal} + unspecified`
                : 'Needed, no quantity specified'
              : String(categoryOnlyTotal),
            hasUnspecifiedQuantity: categoryOnlyUnspecified,
            currentStock,
            needToBuy,
            beneficiariesCount: categoryOnlyBeneficiaries.length,
            beneficiaries: categoryOnlyBeneficiaries,
          });
        }
      }

      const filteredItems = items.filter((row) => {
        if (!search) return row.beneficiariesCount > 0 || row.totalNeeded > 0;
        return (
          this.matchesSearch(search, cat.name, row.itemName) &&
          (row.beneficiariesCount > 0 || row.totalNeeded > 0)
        );
      });

      if (filteredItems.length === 0) continue;

      categories.push({
        aidCategoryId: cat.id,
        aidCategoryName: cat.name,
        items: this.sortItems(filteredItems, field, asc),
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

    const rows: unknown[][] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        if (item.beneficiaries.length === 0) {
          rows.push([
            cat.aidCategoryName,
            item.itemName,
            item.unit,
            item.totalNeeded,
            item.totalNeededLabel,
            item.currentStock,
            item.needToBuy,
            item.beneficiariesCount,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ]);
          continue;
        }
        for (const ben of item.beneficiaries) {
          rows.push([
            cat.aidCategoryName,
            item.itemName,
            item.unit,
            item.totalNeeded,
            item.totalNeededLabel,
            item.currentStock,
            item.needToBuy,
            item.beneficiariesCount,
            ben.fullName,
            ben.phone,
            ben.area ?? '',
            ben.street ?? '',
            ben.quantity ?? '',
            ben.quantityLabel,
            ben.notes ?? '',
          ]);
        }
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
