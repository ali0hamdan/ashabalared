import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import type { AidCatalogCategory, ItemFieldRowState } from '@/lib/beneficiaryItemNeeds';

type Props = {
  t: TFunction;
  catLoading: boolean;
  catRows: AidCatalogCategory[];
  hasAnyCatalogItems: boolean;
  canCook: boolean;
  onCanCookChange: (v: boolean) => void;
  categoryChecked: Record<string, boolean>;
  setCategoryChecked: Dispatch<SetStateAction<Record<string, boolean>>>;
  itemFields: Record<string, ItemFieldRowState>;
  setItemFields: Dispatch<SetStateAction<Record<string, ItemFieldRowState>>>;
};

export function BeneficiaryItemNeedsFields({
  t,
  catLoading,
  catRows,
  hasAnyCatalogItems,
  canCook,
  onCanCookChange,
  categoryChecked,
  setCategoryChecked,
  itemFields,
  setItemFields,
}: Props) {
  function setCategoryNeed(categoryId: string, checked: boolean) {
    setCategoryChecked((m) => ({ ...m, [categoryId]: checked }));
    if (!checked) {
      const cat = catRows.find((c) => c.id === categoryId);
      if (!cat) return;
      setItemFields((m) => {
        const next = { ...m };
        for (const it of cat.items) {
          next[it.id] = { notes: '', qty: '' };
        }
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      {catLoading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <input
              id="beneficiary-can-cook-fields"
              type="checkbox"
              checked={canCook}
              onChange={(e) => onCanCookChange(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border border-input accent-primary"
            />
            <Label htmlFor="beneficiary-can-cook-fields" className="cursor-pointer text-sm font-medium leading-none">
              {t('beneficiaryNew.canCook')}
            </Label>
          </div>

          {!hasAnyCatalogItems ? (
            <p className="text-sm text-muted-foreground">{t('beneficiaryNew.noCatalogItems')}</p>
          ) : (
            catRows.map((c) => {
              const catOn = Boolean(categoryChecked[c.id]);
              const catInputId = `need-category-${c.id}`;
              return (
                <div key={c.id} className="rounded-lg border border-border bg-muted/10 p-3 sm:p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <input
                      id={catInputId}
                      type="checkbox"
                      checked={catOn}
                      onChange={(e) => setCategoryNeed(c.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
                    />
                    <Label htmlFor={catInputId} className="cursor-pointer text-base font-semibold leading-snug text-foreground">
                      {c.name}
                    </Label>
                  </div>
                  {c.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('beneficiaryNew.categoryNoItems')}</p>
                  ) : (
                    <ul className={`space-y-3 ${!catOn ? 'opacity-60' : ''}`}>
                      {c.items.map((it) => {
                        const st = itemFields[it.id] ?? { notes: '', qty: '' };
                        const disabled = !catOn;
                        return (
                          <li
                            key={it.id}
                            className="flex flex-col gap-3 rounded-lg border border-border bg-background/80 p-3 sm:flex-row sm:items-start sm:gap-3"
                          >
                            <div className="min-w-0 flex-1 sm:pt-0.5">
                              <div className="text-sm font-medium leading-snug text-foreground">{it.name}</div>
                              {it.unit ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">{t('beneficiaryNew.itemUnit', { unit: it.unit })}</p>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                              <div className="min-w-0 flex-1 space-y-1">
                                <Label className="text-xs text-muted-foreground sm:sr-only">{t('beneficiaryNew.itemNotesLabel')}</Label>
                                <Input
                                  className="h-10"
                                  maxLength={500}
                                  disabled={disabled}
                                  placeholder={t('beneficiaryNew.categoryNotesPlaceholder')}
                                  value={st.notes}
                                  onChange={(e) =>
                                    setItemFields((m) => {
                                      const cur = m[it.id] ?? st;
                                      return { ...m, [it.id]: { ...cur, notes: e.target.value } };
                                    })
                                  }
                                />
                              </div>
                              <div className="w-full shrink-0 space-y-1 sm:w-28">
                                <Label className="text-xs text-muted-foreground sm:sr-only">{t('beneficiaryNew.qtyLabel')}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  className="h-10"
                                  disabled={disabled}
                                  placeholder="0"
                                  value={st.qty}
                                  onChange={(e) =>
                                    setItemFields((m) => {
                                      const cur = m[it.id] ?? st;
                                      return { ...m, [it.id]: { ...cur, qty: e.target.value } };
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
