/**
 * Identifies the food-rations aid category in the UI (same rules as backend).
 * Keep alias list aligned with `backend/src/beneficiaries/constants/food-rations-category.ts`.
 */
import type { AidCatalogCategory, ItemFieldRowState } from '@/lib/beneficiaryItemNeeds';

function squeezeWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const FOOD_RATIONS_ALIASES_EXACT = new Set<string>([
  squeezeWs('حصص غذائية'),
  squeezeWs('Food rations'),
  squeezeWs('Food ration'),
  squeezeWs('Food'),
]);

export function isFoodRationsCategoryName(name: string | null | undefined): boolean {
  if (name === null || name === undefined) return false;
  const t = squeezeWs(name);
  if (!t.length) return false;
  if (FOOD_RATIONS_ALIASES_EXACT.has(t)) return true;
  const lower = asciiLower(t);
  if (FOOD_RATIONS_ALIASES_EXACT.has(lower)) return true;
  return false;
}

export function isFoodRationsAidCategory(category: Pick<AidCatalogCategory, 'name'>): boolean {
  return isFoodRationsCategoryName(category.name);
}

/** Clears food-rations selections when Can cook is off (UI + payload safety). */
export function applyFoodRationsCookingGate(
  canCook: boolean,
  catRows: AidCatalogCategory[],
  bundle: {
    categoryChecked: Record<string, boolean>;
    categoryQtyFields: Record<string, string>;
    itemFields: Record<string, ItemFieldRowState>;
  },
): {
  categoryChecked: Record<string, boolean>;
  categoryQtyFields: Record<string, string>;
  itemFields: Record<string, ItemFieldRowState>;
} {
  if (canCook) return bundle;
  const categoryChecked = { ...bundle.categoryChecked };
  const categoryQtyFields = { ...bundle.categoryQtyFields };
  const itemFields = { ...bundle.itemFields };
  for (const c of catRows) {
    if (!isFoodRationsAidCategory(c)) continue;
    categoryChecked[c.id] = false;
    categoryQtyFields[c.id] = '';
    for (const it of c.items) {
      itemFields[it.id] = { notes: '', qty: '' };
    }
  }
  return { categoryChecked, categoryQtyFields, itemFields };
}
