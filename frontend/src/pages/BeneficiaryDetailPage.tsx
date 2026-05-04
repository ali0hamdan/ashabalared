import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { BeneficiaryItemNeedsFields } from '@/components/BeneficiaryItemNeedsFields';
import { BeneficiaryStatusBadge, DistributionStatusBadge } from '@/components/StatusBadge';
import {
  buildCategoryNeedsPayload,
  buildItemNeedsPayload,
  hydrateNeedsFormFromItemNeeds,
  normalizeAidCategoriesForForm,
  validateItemQtyInCheckedCategories,
} from '@/lib/beneficiaryItemNeeds';
import { api } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BENEFICIARY_AREA_VALUES, isAllowedBeneficiaryArea } from '@/lib/beneficiaryAreas';

export function BeneficiaryDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.roleCode);
  const canEdit = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['beneficiary', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get(`/beneficiaries/${id}`)).data,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'beneficiary-edit', id],
    enabled: Boolean(id) && canEdit,
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [householdSize, setHouseholdSize] = useState('1');
  const [canCook, setCanCook] = useState(false);
  const [categoryChecked, setCategoryChecked] = useState<Record<string, boolean>>({});
  const [itemFields, setItemFields] = useState<Record<string, { notes: string; qty: string }>>({});
  const [showNotNeeded, setShowNotNeeded] = useState(false);

  const catRows = useMemo(() => normalizeAidCategoriesForForm(categories), [categories]);

  const areaSelectOptions = useMemo(() => {
    const cur = data?.area?.trim() ?? '';
    if (!cur) return [...BENEFICIARY_AREA_VALUES];
    if (isAllowedBeneficiaryArea(cur)) return [...BENEFICIARY_AREA_VALUES];
    return [cur, ...BENEFICIARY_AREA_VALUES];
  }, [data?.area]);

  const streetDisplay = useMemo(() => {
    if (!data) return '';
    const row = data as { street?: string | null; addressLine?: string | null };
    const raw = typeof row.street === 'string' ? row.street : row.addressLine;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [data]);

  useEffect(() => {
    if (!editing || !data || categories === undefined) return;
    const rows = normalizeAidCategoriesForForm(categories);
    setFullName(data.fullName ?? '');
    setPhone(data.phone ?? '');
    setArea(data.area ?? '');
    const row = data as { street?: string | null; addressLine?: string | null };
    setStreet(typeof row.street === 'string' ? row.street : typeof row.addressLine === 'string' ? row.addressLine : '');
    setHouseholdSize(String(data.familyCount ?? 1));
    setCanCook(Boolean(data.cookingStove));
    const rawNeeds = (data.itemNeeds ?? []) as Array<{
      aidCategoryItemId: string;
      needed?: boolean;
      quantity?: number;
      notes?: string | null;
    }>;
    const beneficiaryCategories = (data.categories ?? []) as Array<{
      categoryId?: string;
      category?: { id: string };
      quantity?: number;
      notes?: string | null;
    }>;
    const h = hydrateNeedsFormFromItemNeeds(rows, rawNeeds, beneficiaryCategories);
    setCategoryChecked(h.categoryChecked);
    setItemFields(h.itemFields);
  }, [editing, data, categories]);

  useEffect(() => {
    if (!editing) return;
    setCategoryChecked((prev) => {
      const next = { ...prev };
      for (const c of catRows) {
        if (!(c.id in next)) next[c.id] = false;
      }
      return next;
    });
    setItemFields((prev) => {
      const next = { ...prev };
      for (const c of catRows) {
        for (const it of c.items) {
          if (!(it.id in next)) next[it.id] = { notes: '', qty: '' };
        }
      }
      return next;
    });
  }, [catRows, editing]);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.patch(`/beneficiaries/${id}`, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['beneficiary', id] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
      setEditing(false);
      toast.success(t('beneficiaryDetail.updateSuccess'));
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
    },
  });

  const neededByCategory = useMemo(() => {
    const groups = (data?.itemNeedsByCategory ?? []) as Array<{ category: { id: string; name: string }; needs: any[] }>;
    return groups
      .map((g) => ({
        category: g.category,
        needs: (g.needs ?? []).filter((n: { needed?: boolean }) => n.needed),
      }))
      .filter((g) => g.needs.length > 0);
  }, [data]);

  const notNeededItems = useMemo(
    () => ((data?.itemNeeds ?? []) as any[]).filter((r) => r.needed === false),
    [data],
  );

  /** Category-level rows only when no “needed” catalog items are shown for that category (avoid duplicate headings). */
  const categoriesWithNeededItems = useMemo(() => {
    const groups = (data?.itemNeedsByCategory ?? []) as Array<{ category: { id: string }; needs: any[] }>;
    return new Set(
      groups
        .filter((g) => (g.needs ?? []).some((n: { needed?: boolean }) => n.needed))
        .map((g) => g.category.id),
    );
  }, [data]);

  const legacyCategoryRows = useMemo(() => {
    const all = (data?.categories ?? []) as any[];
    return all.filter((n) => !categoriesWithNeededItems.has(n.category?.id));
  }, [data, categoriesWithNeededItems]);

  const dateLocale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';

  if (!id) return null;
  if (isError) return <div className="text-sm text-muted-foreground">{t('common.saveError')}</div>;
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const deliveredCount = (data.distributions ?? []).filter((d: { status: string }) => d.status === 'DELIVERED').length;

  function validateEdit(): boolean {
    if (!fullName.trim()) {
      toast.error(t('beneficiaryNew.validationFullName'));
      return false;
    }
    const phoneTrim = phone.trim();
    if (phoneTrim.length > 0 && phoneTrim.length < 3) {
      toast.error(t('beneficiaryNew.validationPhoneMin'));
      return false;
    }
    if (!area.trim()) {
      toast.error(t('beneficiaryNew.validationArea'));
      return false;
    }
    const areaTrim = area.trim();
    if (!isAllowedBeneficiaryArea(areaTrim) && areaTrim !== (data.area ?? '').trim()) {
      toast.error(t('beneficiaryNew.validationAreaInvalid'));
      return false;
    }
    const n = parseInt(householdSize, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t('beneficiaryNew.validationHousehold'));
      return false;
    }
    const qtyCheck = validateItemQtyInCheckedCategories(catRows, categoryChecked, itemFields);
    if (qtyCheck.ok === false) {
      toast.error(t('beneficiaryNew.validationItemNeedQty', { name: qtyCheck.itemName, category: qtyCheck.categoryName }));
      return false;
    }
    return true;
  }

  function saveEdit() {
    if (!validateEdit()) return;
    const familyCount = parseInt(householdSize, 10);
    const itemNeeds = buildItemNeedsPayload(catRows, categoryChecked, itemFields);
    const beneficiaryCategories = (data.categories ?? []) as Array<{
      categoryId?: string;
      category?: { id: string };
      quantity?: number;
      notes?: string | null;
    }>;
    const categoryNeeds = buildCategoryNeedsPayload(catRows, categoryChecked, beneficiaryCategories);
    const body: Record<string, unknown> = {
      fullName: fullName.trim(),
      area: area.trim(),
      street: street.trim(),
      familyCount,
      regionId: null,
      district: null,
      cookingStove: canCook,
      itemNeeds,
      categoryNeeds,
    };
    const phoneTrim = phone.trim();
    if (phoneTrim.length >= 3) {
      body.phone = phoneTrim;
    }
    updateMutation.mutate(body);
  }

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-col gap-3 print:hidden md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.fullName}</h1>
          <p className="text-sm text-muted-foreground">{t('beneficiaryDetail.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button type="button" variant="outline" onClick={() => (editing ? setEditing(false) : setEditing(true))}>
              {editing ? t('common.cancel') : t('common.edit')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => window.print()}>
            {t('beneficiaryDetail.print')}
          </Button>
        </div>
      </div>

      {editing ? (
        <Card className="space-y-4 p-4 sm:p-6">
          <CardTitle>{t('beneficiaryDetail.editTitle')}</CardTitle>
          <CardDescription>{t('beneficiaryDetail.editDesc')}</CardDescription>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('beneficiaryNew.fullName')}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('beneficiaryNew.phone')}</Label>
              <p className="text-xs text-muted-foreground">{t('beneficiaryNew.phoneOptionalHint')}</p>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label>{t('beneficiaryNew.householdSize')}</Label>
              <Input type="number" min={1} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('beneficiaryNew.area')}</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="">{t('beneficiaryNew.areaPlaceholder')}</option>
                {areaSelectOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('beneficiaryNew.street')}</Label>
              <p className="text-xs text-muted-foreground">{t('beneficiaryNew.streetHint')}</p>
              <Input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                autoComplete="street-address"
                placeholder={t('beneficiaryNew.streetPlaceholder')}
              />
            </div>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <div className="font-medium">{t('beneficiaryNew.needsTitle')}</div>
            <p className="text-sm text-muted-foreground">{t('beneficiaryNew.needsDescItems')}</p>
            <BeneficiaryItemNeedsFields
              t={t}
              catLoading={categories === undefined}
              catRows={catRows}
              hasAnyCatalogItems={catRows.some((c) => c.items.length > 0)}
              canCook={canCook}
              onCanCookChange={setCanCook}
              categoryChecked={categoryChecked}
              setCategoryChecked={setCategoryChecked}
              itemFields={itemFields}
              setItemFields={setItemFields}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={updateMutation.isPending} onClick={() => saveEdit()}>
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>{t('beneficiaryDetail.basicTitle')}</CardTitle>
            <CardDescription className="mt-2">{t('beneficiaryDetail.basicDescShort')}</CardDescription>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryDetail.phone')}</dt>
                <dd className="font-medium">{data.phone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.area')}</dt>
                <dd className="font-medium">{data.area?.trim() ? data.area : t('common.dash')}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t('beneficiaryNew.street')}</dt>
                <dd className="font-medium whitespace-pre-wrap">{streetDisplay ? streetDisplay : t('common.dash')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.householdSize')}</dt>
                <dd className="font-medium">{data.familyCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.canCook')}</dt>
                <dd className="font-medium">{data.cookingStove ? t('common.yes') : t('common.no')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryDetail.status')}</dt>
                <dd className="font-medium">
                  <BeneficiaryStatusBadge status={data.status} />
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle>{t('beneficiaryDetail.itemNeedsTitle')}</CardTitle>
            <CardDescription className="mt-2">{t('beneficiaryDetail.itemNeedsDesc')}</CardDescription>

            {neededByCategory.length > 0 ? (
              <div className="mt-3 space-y-4">
                {neededByCategory.map((g) => (
                  <div key={g.category.id}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.category.name}</div>
                    <ul className="mt-2 space-y-2">
                      {g.needs.map((n: { id: string; quantity?: number; notes?: string | null; aidCategoryItem?: { name?: string } }) => (
                        <li key={n.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{n.aidCategoryItem?.name ?? t('common.dash')}</span>
                            <span className="ms-2 text-muted-foreground">
                              {t('beneficiaryDetail.qtyTimes', { qty: typeof n.quantity === 'number' ? n.quantity : 0 })}
                            </span>
                          </div>
                          {n.notes?.trim() ? (
                            <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{n.notes.trim()}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : legacyCategoryRows.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-muted-foreground">{t('beneficiaryDetail.legacyCategoryNeeds')}</p>
                <ul className="space-y-2 text-sm">
                  {legacyCategoryRows.map((n: { id: string; quantity?: number; notes?: string | null; category?: { name?: string } }) => {
                    const q = typeof n.quantity === 'number' ? n.quantity : 0;
                    return (
                    <li key={n.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div>
                        <span className="font-medium">{n.category?.name}</span>
                        {q >= 1 ? (
                          <span className="ms-2 text-muted-foreground">× {q}</span>
                        ) : n.notes?.trim() ? null : (
                          <span className="ms-2 text-xs text-muted-foreground">{t('beneficiaryDetail.categoryNeedNoAmount')}</span>
                        )}
                      </div>
                      {n.notes?.trim() ? <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{n.notes.trim()}</p> : null}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t('common.none')}</p>
            )}

            {legacyCategoryRows.length > 0 && neededByCategory.length > 0 ? (
              <div className="mt-4 border-t border-border pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('beneficiaryDetail.legacyCategoryNeeds')}
                </div>
                <ul className="mt-2 space-y-2 text-sm">
                  {legacyCategoryRows.map((n: { id: string; quantity?: number; notes?: string | null; category?: { name?: string } }) => {
                    const q = typeof n.quantity === 'number' ? n.quantity : 0;
                    return (
                    <li key={n.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <div>
                        <span className="font-medium">{n.category?.name}</span>
                        {q >= 1 ? (
                          <span className="ms-2 text-muted-foreground">× {q}</span>
                        ) : n.notes?.trim() ? null : (
                          <span className="ms-2 text-xs text-muted-foreground">{t('beneficiaryDetail.categoryNeedNoAmount')}</span>
                        )}
                      </div>
                      {n.notes?.trim() ? <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{n.notes.trim()}</p> : null}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {notNeededItems.length > 0 ? (
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-start text-sm font-medium text-foreground hover:bg-muted/50"
                  onClick={() => setShowNotNeeded((v) => !v)}
                  aria-expanded={showNotNeeded}
                >
                  <span>{t('beneficiaryDetail.notNeededTitle', { count: notNeededItems.length })}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', showNotNeeded && 'rotate-180')} />
                </button>
                {showNotNeeded ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {notNeededItems.map((r: { id: string; aidCategoryItem?: { name?: string; aidCategory?: { name?: string } } }) => (
                      <li key={r.id} className="text-muted-foreground">
                        <span className="font-medium text-foreground/90">{r.aidCategoryItem?.aidCategory?.name ?? t('common.dash')}</span>
                        <span className="text-muted-foreground"> — </span>
                        {r.aidCategoryItem?.name ?? t('common.dash')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{t('beneficiaryDetail.notNeededHint')}</p>
                )}
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="text-muted-foreground">{t('beneficiaryDetail.deliveredCountLabel')}</div>
              <div className="text-2xl font-bold">{deliveredCount}</div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardTitle>{t('beneficiaryDetail.distTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('beneficiaryDetail.distDesc')}</CardDescription>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-start">
              <tr className="border-b border-border">
                <th className="p-2">{t('beneficiaryDetail.colStatus')}</th>
                <th className="p-2">{t('beneficiaryDetail.colDate')}</th>
                <th className="p-2">{t('beneficiaryDetail.colPrepared')}</th>
                <th className="p-2">{t('beneficiaryDetail.colDeliveredAt')}</th>
                <th className="p-2">{t('beneficiaryDetail.colItems')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.distributions ?? []).map((d: any) => (
                <tr key={d.id} className="border-b border-border align-top">
                  <td className="p-2">
                    <DistributionStatusBadge status={d.status} />
                  </td>
                  <td className="p-2 whitespace-nowrap">{new Date(d.createdAt).toLocaleString(dateLocale)}</td>
                  <td className="p-2">{d.createdBy?.displayName}</td>
                  <td className="p-2 whitespace-nowrap">
                    {d.deliveredAt ? new Date(d.deliveredAt).toLocaleString(dateLocale) : t('common.dash')}
                  </td>
                  <td className="p-2">
                    <ul className="space-y-1">
                      {(d.items ?? []).map((it: any) => {
                        const name = it.stockItem?.aidCategoryItem?.name ?? it.aidCategory?.name ?? '';
                        const qty = it.quantityPlanned ?? 0;
                        const delivered = it.quantityDelivered ?? 0;
                        return (
                          <li key={it.id}>
                            {qty} × {name}{' '}
                            <span className="text-muted-foreground">
                              ({t('distributions.deliveredQty')}: {delivered})
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('beneficiaryDetail.timelineTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('beneficiaryDetail.timelineDesc')}</CardDescription>
        <ol className="mt-4 space-y-3 border-s-2 border-border ps-4">
          {(data.timelineEvents ?? []).map((ev: any) => (
            <li key={ev.id} className="relative">
              <div className="absolute -start-[21px] top-1 h-3 w-3 rounded-full bg-primary" />
              <div className="text-sm font-medium">{ev.titleAr}</div>
              <div className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString(dateLocale)}</div>
              {ev.detail ? <div className="mt-1 text-sm whitespace-pre-wrap">{ev.detail}</div> : null}
            </li>
          ))}
          {(data.timelineEvents ?? []).length === 0 ? <li className="text-sm text-muted-foreground">{t('common.none')}</li> : null}
        </ol>
      </Card>
    </div>
  );
}
