/** Shared types and helpers for beneficiary needs (category checkbox + per-item qty/notes). */

export type AidCatalogItem = {
  id: string;
  name: string;
  sortOrder?: number;
  defaultQuantity?: number;
  unit?: string;
};

export type AidCatalogCategory = {
  id: string;
  name: string;
  isActive?: boolean;
  /** Always present after `normalizeAidCategoriesForForm` (empty when API omits items). */
  items: AidCatalogItem[];
};

/** Per-item notes/qty only (category on/off is separate). */
export type ItemFieldRowState = { notes: string; qty: string };

/** @deprecated Use ItemFieldRowState; kept name for gradual migration in imports. */
export type ItemNeedRowState = ItemFieldRowState;

export type ItemNeedPayload = { aidCategoryItemId: string; needed: boolean; quantity: number; notes?: string };

/** Persisted on `BeneficiaryCategory` (category checkbox, optional amount/notes). */
export type CategoryNeedPayload = { categoryId: string; quantity: number; notes: string | null };

/** Active categories with items sorted for stable UI. */
export function normalizeAidCategoriesForForm(data: unknown): AidCatalogCategory[] {
  const list = Array.isArray(data) ? (data as (Omit<AidCatalogCategory, 'items'> & { items?: AidCatalogItem[] })[]) : [];
  return list
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      items: [...(c.items ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
      ),
    }));
}

/** True when this saved row should count as “needed” for UI (category checkbox on). */
function itemRowSignalsNeeded(row: {
  needed?: boolean;
  quantity?: number;
  notes?: string | null;
}): boolean {
  if (!row || row.needed === false) return false;
  const q = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 0;
  const n = typeof row.notes === 'string' ? row.notes.trim() : '';
  return q >= 1 || n.length > 0;
}

/**
 * Hydrate category checkboxes + item fields from API `itemNeeds` (and catalog rows).
 * `beneficiaryCategories` is `BeneficiaryCategory[]` from GET beneficiary (any row = category checked).
 */
export function hydrateNeedsFormFromItemNeeds(
  catRows: AidCatalogCategory[],
  itemNeeds: Array<{ aidCategoryItemId: string; needed?: boolean; quantity?: number; notes?: string | null }>,
  beneficiaryCategories?: Array<{ categoryId?: string; category?: { id: string }; quantity?: number; notes?: string | null }>,
): { categoryChecked: Record<string, boolean>; itemFields: Record<string, ItemFieldRowState> } {
  const byItem = new Map(itemNeeds.map((r) => [r.aidCategoryItemId, r]));
  const categoryChecked: Record<string, boolean> = {};
  const itemFields: Record<string, ItemFieldRowState> = {};

  for (const c of catRows) {
    let anyNeededInCat = false;
    for (const it of c.items) {
      const row = byItem.get(it.id);
      if (itemRowSignalsNeeded(row ?? { needed: false, quantity: 0, notes: null })) {
        anyNeededInCat = true;
      }
      if (row) {
        const q = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? Math.max(0, Math.floor(row.quantity)) : 0;
        const note = typeof row.notes === 'string' ? row.notes : '';
        const qtyStr = q >= 1 ? String(q) : note.trim() ? String(q) : '';
        itemFields[it.id] = { notes: note, qty: qtyStr };
      } else {
        itemFields[it.id] = { notes: '', qty: '' };
      }
    }
    const legacy = beneficiaryCategories?.find((bc) => bc.category?.id === c.id || bc.categoryId === c.id);
    categoryChecked[c.id] = anyNeededInCat || Boolean(legacy);
  }
  return { categoryChecked, itemFields };
}

/**
 * Build `itemNeeds` for API: for each **checked** category, emit rows for items with qty ≥ 1 or non-empty notes.
 * Unchecked categories contribute no rows (cleared on full replace).
 */
export function buildItemNeedsPayload(
  catRows: AidCatalogCategory[],
  categoryChecked: Record<string, boolean>,
  itemFields: Record<string, ItemFieldRowState>,
): ItemNeedPayload[] {
  const itemNeeds: ItemNeedPayload[] = [];
  for (const c of catRows) {
    if (!categoryChecked[c.id]) continue;
    for (const it of c.items) {
      const st = itemFields[it.id] ?? { notes: '', qty: '' };
      const raw = (st.qty ?? '').trim();
      const q = raw === '' ? 0 : parseInt(raw, 10);
      const qSafe = Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0;
      const note = (st.notes ?? '').trim();
      if (qSafe < 1 && !note) continue;
      itemNeeds.push({
        aidCategoryItemId: it.id,
        needed: true,
        quantity: qSafe,
        ...(note ? { notes: note } : {}),
      });
    }
  }
  return itemNeeds;
}

/**
 * Build `categoryNeeds` for API from category checkboxes.
 * When editing, pass previous `beneficiary.categories` rows to preserve quantity/notes for unchanged selections.
 */
export function buildCategoryNeedsPayload(
  catRows: AidCatalogCategory[],
  categoryChecked: Record<string, boolean>,
  previous?: Array<{ categoryId?: string; category?: { id: string }; quantity?: number; notes?: string | null }>,
): CategoryNeedPayload[] {
  const out: CategoryNeedPayload[] = [];
  for (const c of catRows) {
    if (!categoryChecked[c.id]) continue;
    const pid = previous?.find((x) => x.category?.id === c.id || x.categoryId === c.id);
    if (pid) {
      const q = typeof pid.quantity === 'number' && Number.isFinite(pid.quantity) ? Math.max(0, Math.floor(pid.quantity)) : 0;
      const n = typeof pid.notes === 'string' ? pid.notes.trim() : '';
      out.push({ categoryId: c.id, quantity: q, notes: n.length ? n : null });
    } else {
      out.push({ categoryId: c.id, quantity: 0, notes: null });
    }
  }
  return out;
}

/** Invalid non-empty quantity strings (e.g. "abc" or negative) inside checked categories. */
export function validateItemQtyInCheckedCategories(
  catRows: AidCatalogCategory[],
  categoryChecked: Record<string, boolean>,
  itemFields: Record<string, ItemFieldRowState>,
): { readonly ok: true } | { readonly ok: false; readonly itemName: string; readonly categoryName: string } {
  for (const c of catRows) {
    if (!categoryChecked[c.id]) continue;
    for (const it of c.items) {
      const raw = (itemFields[it.id]?.qty ?? '').trim();
      if (raw === '') continue;
      const q = parseInt(raw, 10);
      if (!Number.isFinite(q) || q < 0) {
        return { ok: false, itemName: it.name, categoryName: c.name } as const;
      }
    }
  }
  return { ok: true } as const;
}
