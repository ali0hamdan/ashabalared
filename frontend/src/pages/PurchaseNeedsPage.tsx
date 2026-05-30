import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTableShell } from '@/components/layout/DataTableShell';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

type AidCat = { id: string; name: string; isActive?: boolean };

type PurchaseNeedsBeneficiary = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  street: string | null;
  quantity: number | null;
  quantityLabel: string;
  notes: string | null;
};

type PurchaseNeedsItem = {
  type: 'ITEM';
  aidCategoryItemId: string;
  itemName: string;
  unit: string;
  totalNeeded: number;
  totalNeededLabel: string;
  hasUnspecifiedQuantity: boolean;
  currentStock: number;
  needToBuy: number;
  beneficiariesCount: number;
  beneficiaries: PurchaseNeedsBeneficiary[];
};

type PurchaseNeedsUnspecified = {
  type: 'CATEGORY';
  label: string;
  totalNeeded: number;
  totalNeededLabel: string;
  hasUnspecifiedQuantity: boolean;
  beneficiariesCount: number;
  beneficiaries: PurchaseNeedsBeneficiary[];
  helperText: string;
};

type PurchaseNeedsCategory = {
  aidCategoryId: string;
  aidCategoryName: string;
  items: PurchaseNeedsItem[];
  unspecifiedNeed: PurchaseNeedsUnspecified | null;
};

type PurchaseNeedsResponse = {
  categories: PurchaseNeedsCategory[];
};

type SortByKey = 'shortage' | 'totalNeeded' | 'categoryName' | 'itemName';

export function PurchaseNeedsPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const showExport = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const [aidCategoryId, setAidCategoryId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sortBy, setSortBy] = useState<SortByKey>('shortage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [drillItem, setDrillItem] = useState<{
    categoryName: string;
    title: string;
    beneficiaries: PurchaseNeedsBeneficiary[];
    helperText?: string;
  } | null>(null);
  const [exportPending, setExportPending] = useState(false);

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  const { data: categories } = useQuery({
    queryKey: ['aid-categories', 'purchase-needs'],
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const catOpts = useMemo(() => {
    const list = Array.isArray(categories) ? (categories as AidCat[]) : [];
    return [...list].filter((c) => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const queryParams = useMemo(
    () => ({
      aidCategoryId: aidCategoryId || undefined,
      search: searchDebounced || undefined,
      includeInactive: includeInactive ? 'true' : undefined,
      sortBy,
      sortDirection,
    }),
    [aidCategoryId, searchDebounced, includeInactive, sortBy, sortDirection],
  );

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['purchase-needs', queryParams],
    queryFn: async () =>
      (await api.get<PurchaseNeedsResponse>('/reports/purchase-needs', { params: queryParams }))
        .data,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!data?.categories.length) return;
    setExpandedCats((prev) => {
      const next = { ...prev };
      for (const c of data.categories) {
        if (next[c.aidCategoryId] === undefined) next[c.aidCategoryId] = true;
      }
      return next;
    });
  }, [data]);

  const exportCsv = useCallback(async () => {
    setExportPending(true);
    try {
      const res = await api.get('/reports/purchase-needs/export', {
        params: queryParams,
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      if (blob.type.includes('json')) {
        const text = await blob.text();
        let message = t('common.exportError');
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (typeof parsed.message === 'string' && parsed.message.trim()) {
            message = parsed.message;
          }
        } catch {
          /* keep default */
        }
        toast.error(message);
        return;
      }
      let filename = 'purchase-needs.csv';
      const disp = res.headers['content-disposition'] as string | undefined;
      if (disp) {
        const m = /filename="([^"]+)"/i.exec(disp);
        if (m?.[1]) filename = m[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.exportSuccess'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: Blob | { message?: string } } };
      const errData = err.response?.data;
      if (errData instanceof Blob) {
        try {
          const text = await errData.text();
          const parsed = JSON.parse(text) as { message?: string };
          if (typeof parsed.message === 'string' && parsed.message.trim()) {
            toast.error(parsed.message);
            return;
          }
        } catch {
          /* fall through */
        }
      } else if (typeof errData?.message === 'string' && errData.message.trim()) {
        toast.error(errData.message);
        return;
      }
      toast.error(t('common.exportError'));
    } finally {
      setExportPending(false);
    }
  }, [queryParams, t]);

  const exportButton = (
    <Button
      type="button"
      variant="outline"
      className="min-h-10 shrink-0 gap-2 px-4"
      disabled={exportPending}
      onClick={() => void exportCsv()}
    >
      <Download className="h-4 w-4 shrink-0" aria-hidden />
      {exportPending ? t('purchaseNeeds.exporting') : t('purchaseNeeds.exportCsv')}
    </Button>
  );

  const totalItems =
    data?.categories.reduce(
      (n, c) => n + c.items.length + (c.unspecifiedNeed ? 1 : 0),
      0,
    ) ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('purchaseNeeds.title')}
        description={t('purchaseNeeds.subtitle')}
        actions={showExport ? exportButton : undefined}
      />

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('purchaseNeeds.filterCategory')}</Label>
            <select
              className="form-select h-10 w-full"
              value={aidCategoryId}
              onChange={(e) => setAidCategoryId(e.target.value)}
            >
              <option value="">{t('purchaseNeeds.allCategories')}</option>
              {catOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">{t('purchaseNeeds.searchLabel')}</Label>
            <Input
              className="h-10"
              placeholder={t('purchaseNeeds.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('purchaseNeeds.sortBy')}</Label>
            <select
              className="form-select h-10 w-full"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortByKey)}
            >
              <option value="shortage">{t('purchaseNeeds.sortShortage')}</option>
              <option value="totalNeeded">{t('purchaseNeeds.sortNeeded')}</option>
              <option value="categoryName">{t('purchaseNeeds.sortCategory')}</option>
              <option value="itemName">{t('purchaseNeeds.sortItem')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('purchaseNeeds.sortDirection')}</Label>
            <select
              className="form-select h-10 w-full"
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
            >
              <option value="desc">{t('purchaseNeeds.sortDesc')}</option>
              <option value="asc">{t('purchaseNeeds.sortAsc')}</option>
            </select>
          </div>
          {(isSuperAdmin || role === 'ADMIN') ? (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm xl:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              {t('purchaseNeeds.includeInactive')}
            </label>
          ) : null}
        </div>
        {data && !isPending ? (
          <p className="text-sm text-muted-foreground border-t border-border/60 pt-4">
            {t('purchaseNeeds.resultSummary', {
              categories: data.categories.length,
              items: totalItems,
            })}
          </p>
        ) : null}
      </Card>

      <DataTableShell className={cn(isFetching && !isPending && 'opacity-[0.92] transition-opacity')}>
        {isPending ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !data?.categories.length ? (
          <EmptyState title={t('purchaseNeeds.empty')} />
        ) : (
          <div className="divide-y divide-border">
            {data.categories.map((cat) => {
              const open = expandedCats[cat.aidCategoryId] !== false;
              return (
                <div key={cat.aidCategoryId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 bg-muted/30 px-4 py-3 text-start hover:bg-muted/50"
                    onClick={() =>
                      setExpandedCats((prev) => ({
                        ...prev,
                        [cat.aidCategoryId]: !open,
                      }))
                    }
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="font-semibold text-foreground">{cat.aidCategoryName}</span>
                    <span className="text-xs text-muted-foreground">
                      (
                      {cat.items.length +
                        (cat.unspecifiedNeed ? 1 : 0)}{' '}
                      {t('purchaseNeeds.items')})
                    </span>
                  </button>
                  {open ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-muted/20 text-start">
                          <tr className="border-b border-border">
                            <th className="p-3">{t('purchaseNeeds.colItem')}</th>
                            <th className="p-3">{t('purchaseNeeds.colUnit')}</th>
                            <th className="p-3">{t('purchaseNeeds.colNeeded')}</th>
                            <th className="p-3">{t('purchaseNeeds.colStock')}</th>
                            <th className="p-3">{t('purchaseNeeds.colBuy')}</th>
                            <th className="p-3">{t('purchaseNeeds.colBeneficiaries')}</th>
                            <th className="p-3">{t('purchaseNeeds.colActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cat.items.map((item) => (
                            <tr
                              key={item.aidCategoryItemId}
                              className="border-b border-border align-top hover:bg-muted/15"
                            >
                              <td className="p-3 font-medium">{item.itemName}</td>
                              <td className="p-3 text-muted-foreground">{item.unit}</td>
                              <td className="p-3 tabular-nums">
                                {item.totalNeededLabel}
                              </td>
                              <td className="p-3 tabular-nums">{item.currentStock}</td>
                              <td className="p-3">
                                {item.needToBuy > 0 ? (
                                  <Badge variant="warning">
                                    {t('purchaseNeeds.buyBadge', { count: item.needToBuy })}
                                  </Badge>
                                ) : (
                                  <Badge variant="success">
                                    {t('purchaseNeeds.enoughStock')}
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 tabular-nums">{item.beneficiariesCount}</td>
                              <td className="p-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 gap-1.5 px-2.5 text-xs"
                                  onClick={() =>
                                    setDrillItem({
                                      categoryName: cat.aidCategoryName,
                                      title: item.itemName,
                                      beneficiaries: item.beneficiaries,
                                    })
                                  }
                                >
                                  <Users className="h-3.5 w-3.5" aria-hidden />
                                  {t('purchaseNeeds.viewBeneficiaries')}
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {cat.unspecifiedNeed ? (
                            <tr
                              key={`${cat.aidCategoryId}-unspecified`}
                              className="border-b border-border align-top bg-muted/10 hover:bg-muted/20"
                            >
                              <td className="p-3">
                                <div className="font-medium">
                                  {t('purchaseNeeds.unspecifiedNeed')}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t('purchaseNeeds.specificItemNotSelected')}
                                </p>
                              </td>
                              <td className="p-3 text-muted-foreground">{t('common.dash')}</td>
                              <td className="p-3 tabular-nums">
                                {cat.unspecifiedNeed.totalNeededLabel}
                              </td>
                              <td className="p-3 tabular-nums text-muted-foreground">
                                {t('common.dash')}
                              </td>
                              <td className="p-3">
                                <Badge variant="neutral">
                                  {t('purchaseNeeds.chooseItem')}
                                </Badge>
                              </td>
                              <td className="p-3 tabular-nums">
                                {cat.unspecifiedNeed.beneficiariesCount}
                              </td>
                              <td className="p-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 gap-1.5 px-2.5 text-xs"
                                  onClick={() =>
                                    setDrillItem({
                                      categoryName: cat.aidCategoryName,
                                      title: t('purchaseNeeds.unspecifiedNeed'),
                                      beneficiaries: cat.unspecifiedNeed!.beneficiaries,
                                      helperText: t('purchaseNeeds.specificItemNotSelected'),
                                    })
                                  }
                                >
                                  <Users className="h-3.5 w-3.5" aria-hidden />
                                  {t('purchaseNeeds.viewBeneficiaries')}
                                </Button>
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </DataTableShell>

      <Dialog
        open={Boolean(drillItem)}
        onClose={() => setDrillItem(null)}
        title={drillItem ? `${drillItem.categoryName} — ${drillItem.title}` : ''}
        description={drillItem?.helperText}
      >
        {drillItem ? (
          <div className="max-h-[min(60vh,28rem)] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="p-2">{t('purchaseNeeds.colName')}</th>
                  <th className="p-2">{t('purchaseNeeds.colPhone')}</th>
                  <th className="p-2">{t('purchaseNeeds.colArea')}</th>
                  <th className="p-2">{t('purchaseNeeds.colStreet')}</th>
                  <th className="p-2">{t('purchaseNeeds.colQty')}</th>
                  <th className="p-2">{t('purchaseNeeds.colNotes')}</th>
                </tr>
              </thead>
              <tbody>
                {drillItem.beneficiaries.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 align-top">
                    <td className="p-2">
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        to={`/app/beneficiaries/${b.id}`}
                      >
                        {b.fullName}
                      </Link>
                    </td>
                    <td className="p-2 whitespace-nowrap">{b.phone}</td>
                    <td className="p-2">{b.area ?? t('common.dash')}</td>
                    <td className="p-2 max-w-[10rem] whitespace-pre-wrap text-xs">
                      {b.street ?? t('common.dash')}
                    </td>
                    <td className="p-2">{b.quantityLabel}</td>
                    <td className="p-2 text-xs text-muted-foreground">{b.notes ?? t('common.dash')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
