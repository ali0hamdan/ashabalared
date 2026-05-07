import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { parseDeleteBlockedBody, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CategoryBeneficiariesMobileSkeleton,
  CategoryBeneficiariesTableSkeleton,
} from '@/components/table-skeletons';

function formatDeleteBlockedMessage(blocked: DeleteBlockedPayload): string {
  const rel = blocked.blockingRelations?.filter(Boolean).join(', ');
  return rel ? `${blocked.message} [${rel}]` : blocked.message;
}

function apiErrorMessage(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(m)) return m.filter(Boolean).join(' ');
  if (typeof m === 'string' && m.trim()) return m.trim();
  return fallback;
}

const UNITS = ['PIECE', 'BOX', 'PACK', 'BAG', 'KG', 'LITER', 'SET'] as const;

type CatalogItem = { id: string; name: string; defaultQuantity?: number; unit?: string };

type CategoryRow = {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  archivedAt?: string | null;
  items?: CatalogItem[];
};

type CategoryBeneficiaryNeedLine = { itemName: string; quantity: number; notes: string | null; legacy?: boolean };

type CategoryBeneficiariesPayload = {
  categoryId: string;
  categoryName: string;
  count: number;
  truncated?: boolean;
  beneficiaries: Array<{
    id: string;
    fullName: string;
    phone: string;
    area: string | null;
    street: string | null;
    familyCount: number;
    lines: CategoryBeneficiaryNeedLine[];
  }>;
};

export function CategoriesPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/aid-categories', { params: { includeInactive: 'true' } })).data,
  });
  const rows = useMemo(() => (Array.isArray(data) ? (data as CategoryRow[]) : []), [data]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);

  const tabParam = searchParams.get('cat')?.trim() || '';
  const isOverview = !tabParam;
  const activeCategory = tabParam ? sortedRows.find((c) => c.id === tabParam) : undefined;

  useEffect(() => {
    if (!tabParam) return;
    if (sortedRows.length === 0) return;
    if (!sortedRows.some((c) => c.id === tabParam)) {
      setSearchParams({}, { replace: true });
    }
  }, [tabParam, sortedRows, setSearchParams]);

  const [catDlg, setCatDlg] = useState<'add' | { edit: CategoryRow } | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catActive, setCatActive] = useState(true);

  const [itemDlg, setItemDlg] = useState<{ categoryId: string; mode: 'add' | { edit: CatalogItem } } | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDefQty, setItemDefQty] = useState(1);
  const [itemUnit, setItemUnit] = useState<string>('PIECE');

  const [delCat, setDelCat] = useState<CategoryRow | null>(null);
  const [delCatLoading, setDelCatLoading] = useState(false);
  const [delItem, setDelItem] = useState<CatalogItem | null>(null);

  const [benNeedSearch, setBenNeedSearch] = useState('');
  const [benNeedSearchDebounced, setBenNeedSearchDebounced] = useState('');

  useEffect(() => {
    setBenNeedSearch('');
    setBenNeedSearchDebounced('');
  }, [tabParam]);

  useEffect(() => {
    const tid = window.setTimeout(() => setBenNeedSearchDebounced(benNeedSearch.trim()), 350);
    return () => window.clearTimeout(tid);
  }, [benNeedSearch]);

  const beneficiariesNeedingQuery = useQuery({
    queryKey: ['aid-category-beneficiaries', tabParam, benNeedSearchDebounced],
    queryFn: async () =>
      (
        await api.get<CategoryBeneficiariesPayload>(`/aid-categories/${tabParam}/beneficiaries`, {
          params: {
            ...(benNeedSearchDebounced ? { q: benNeedSearchDebounced } : {}),
            limit: 100,
          },
        })
      ).data,
    enabled: Boolean(!isOverview && tabParam),
    placeholderData: (previousData) => previousData,
  });

  const beneficiariesNeedingInitialSkeleton =
    beneficiariesNeedingQuery.isPending && !beneficiariesNeedingQuery.isPlaceholderData;

  const saveCategory = useMutation({
    mutationFn: async (): Promise<{ kind: 'add'; id: string } | { kind: 'edit'; id: string } | undefined> => {
      if (catDlg === 'add') {
        const { data: created } = await api.post<CategoryRow>('/aid-categories', {
          name: catName,
          description: catDesc || undefined,
          isActive: catActive,
        });
        if (created?.id) return { kind: 'add', id: created.id };
        return undefined;
      }
      if (catDlg && typeof catDlg === 'object' && 'edit' in catDlg) {
        await api.patch(`/aid-categories/${catDlg.edit.id}`, {
          name: catName || undefined,
          description: catDesc,
          isActive: catActive,
        });
        return { kind: 'edit', id: catDlg.edit.id };
      }
      return undefined;
    },
    onSuccess: async (res) => {
      toast.success(t('categories.saveOk'));
      setCatDlg(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
      if (res?.kind === 'add' && res.id) {
        setSearchParams({ cat: res.id }, { replace: true });
      }
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.saveError'));
    },
  });

  const saveItem = useMutation({
    mutationFn: async () => {
      if (!itemDlg) return;
      const body = {
        name: itemName,
        defaultQuantity: itemDefQty,
        unit: itemUnit,
      };
      if (itemDlg.mode === 'add') {
        await api.post(`/aid-categories/${itemDlg.categoryId}/items`, body);
      } else {
        await api.patch(`/aid-categories/items/${itemDlg.mode.edit.id}`, body);
      }
    },
    onSuccess: async () => {
      toast.success(t('categories.itemSaveOk'));
      setItemDlg(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.saveError'));
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => api.delete(`/aid-categories/items/${id}`),
    onSuccess: async () => {
      toast.success(t('categories.itemDeleteOk'));
      setDelItem(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e, t('common.updateError')));
    },
  });

  function openAddCategory() {
    setCatName('');
    setCatDesc('');
    setCatActive(true);
    setCatDlg('add');
  }

  function openEditCategory(c: CategoryRow) {
    setCatName(c.name);
    setCatDesc(c.description ?? '');
    setCatActive(Boolean(c.isActive));
    setCatDlg({ edit: c });
  }

  async function confirmDeleteCategory() {
    if (!delCat) return;
    const deletedId = delCat.id;
    setDelCatLoading(true);
    try {
      const res = await api.delete(`/aid-categories/${delCat.id}`, {
        validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
      });
      if (res.status === 409) {
        const blocked = parseDeleteBlockedBody(res.data);
        if (blocked) {
          toast.error(formatDeleteBlockedMessage(blocked));
          setDelCat(null);
          return;
        }
        toast.error(apiErrorMessage({ response: res }, t('common.updateError')));
        setDelCat(null);
        return;
      }
      if (res.status < 200 || res.status >= 300) {
        toast.error(apiErrorMessage({ response: res }, t('common.updateError')));
        setDelCat(null);
        return;
      }
      toast.success(t('categories.deleteOk'));
      setDelCat(null);
      if (tabParam === deletedId) {
        setSearchParams({}, { replace: true });
      }
      await qc.invalidateQueries({ queryKey: ['categories'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e, t('common.updateError')));
    } finally {
      setDelCatLoading(false);
    }
  }

  function openAddItem(categoryId: string) {
    setItemDlg({ categoryId, mode: 'add' });
    setItemName('');
    setItemDefQty(1);
    setItemUnit('PIECE');
  }

  function openEditItem(categoryId: string, it: CatalogItem) {
    setItemDlg({ categoryId, mode: { edit: it } });
    setItemName(it.name);
    setItemDefQty(it.defaultQuantity ?? 1);
    setItemUnit(it.unit ?? 'PIECE');
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const canEdit = role === 'SUPER_ADMIN' || role === 'ADMIN';

  function setTabCategory(id: string | null) {
    if (!id) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ cat: id }, { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('categories.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('categories.subtitle')}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openAddCategory}>
            {t('categories.addCategory')}
          </Button>
        ) : null}
      </div>

      {sortedRows.length > 0 ? (
        <div className="space-y-3">
          <div
            role="tablist"
            aria-label={t('categories.title')}
            className="flex w-full gap-1 overflow-x-auto border-b border-border pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isOverview}
              className={cn(
                'shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors',
                isOverview
                  ? 'relative z-[1] -mb-px border-border bg-card text-foreground shadow-sm'
                  : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
              onClick={() => setTabCategory(null)}
            >
              {t('categories.tabAll')}
            </button>
            {sortedRows.map((c) => {
              const selected = tabParam === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    'max-w-[12rem] shrink-0 truncate rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors',
                    selected
                      ? 'relative z-[1] -mb-px border-border bg-card text-foreground shadow-sm'
                      : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                  title={c.name}
                  onClick={() => setTabCategory(c.id)}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">{isOverview ? t('categories.tabOverviewHint') : t('categories.tabSingleHint')}</p>

          {isOverview ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedRows.map((c) => {
                const itemCount = (c.items ?? []).length;
                return (
                  <Card key={c.id} className="flex flex-col p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base leading-snug">{c.name}</CardTitle>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.isActive ? (
                            <Badge variant="success">{t('categories.active')}</Badge>
                          ) : (
                            <Badge variant="danger">{t('categories.inactive')}</Badge>
                          )}
                          {c.archivedAt ? (
                            <Badge variant="outline" className="border-amber-600 text-amber-800 dark:text-amber-200">
                              {t('categories.archivedBadge')}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <Button type="button" variant="outline" className="h-8 shrink-0 px-3 text-xs" onClick={() => setTabCategory(c.id)}>
                        {t('categories.viewCategory')}
                      </Button>
                    </div>
                    {c.description ? <CardDescription className="mt-2 line-clamp-2">{c.description}</CardDescription> : null}
                    <p className="mt-3 text-sm text-muted-foreground">{t('categories.itemCount', { count: itemCount })}</p>
                  </Card>
                );
              })}
            </div>
          ) : activeCategory ? (
            <Card className="p-4 sm:p-6">
              <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{activeCategory.name}</CardTitle>
                    {activeCategory.isActive ? (
                      <Badge variant="success">{t('categories.active')}</Badge>
                    ) : (
                      <Badge variant="danger">{t('categories.inactive')}</Badge>
                    )}
                    {activeCategory.archivedAt ? (
                      <Badge variant="outline" className="border-amber-600 text-amber-800 dark:text-amber-200">
                        {t('categories.archivedBadge')}
                      </Badge>
                    ) : null}
                  </div>
                  {activeCategory.description ? (
                    <CardDescription className="text-sm text-foreground/90">{activeCategory.description}</CardDescription>
                  ) : (
                    <CardDescription className="text-sm italic text-muted-foreground">—</CardDescription>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <>
                      <Button variant="outline" type="button" className="h-9 text-xs" onClick={() => openEditCategory(activeCategory)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="outline" type="button" className="h-9 text-xs" onClick={() => setDelCat(activeCategory)}>
                        {t('common.delete')}
                      </Button>
                      <Button type="button" className="h-9 text-xs" onClick={() => openAddItem(activeCategory.id)}>
                        {t('categories.addItem')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-sm">
                {(activeCategory.items ?? []).map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{it.name}</span>
                      <span className="ms-2 text-muted-foreground">
                        {t('categories.defaultQty')}: {it.defaultQuantity} · {it.unit}
                      </span>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" type="button" className="h-8 px-2 text-xs" onClick={() => openEditItem(activeCategory.id, it)}>
                          {t('common.edit')}
                        </Button>
                        <Button variant="outline" type="button" className="h-8 px-2 text-xs" onClick={() => setDelItem(it)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
                {(activeCategory.items ?? []).length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-muted-foreground">{t('categories.noItems')}</li>
                ) : null}
              </ul>

              <div className="mt-6 space-y-4 border-t border-border pt-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base font-semibold">
                    {t('categories.beneficiariesNeedingTitle')}
                    <span className="ms-1 inline-flex items-center gap-1 font-normal text-muted-foreground">
                      (
                      {beneficiariesNeedingInitialSkeleton ? (
                        <Skeleton className="inline-block h-4 w-8" aria-hidden />
                      ) : (
                        (beneficiariesNeedingQuery.data?.count ?? 0)
                      )}
                      )
                    </span>
                  </h2>
                </div>
                <Input
                  value={benNeedSearch}
                  onChange={(e) => setBenNeedSearch(e.target.value)}
                  placeholder={t('categories.beneficiariesNeedingSearchPlaceholder')}
                  className="max-w-md"
                  aria-label={t('categories.beneficiariesNeedingSearchPlaceholder')}
                />

                {beneficiariesNeedingQuery.isError ? (
                  <p className="text-sm text-destructive">{apiErrorMessage(beneficiariesNeedingQuery.error, t('common.updateError'))}</p>
                ) : beneficiariesNeedingInitialSkeleton ? (
                  <div className="space-y-3" aria-busy={true} aria-label={t('common.loading')}>
                    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                      <CategoryBeneficiariesTableSkeleton rows={8} />
                    </div>
                    <CategoryBeneficiariesMobileSkeleton cards={4} />
                  </div>
                ) : (beneficiariesNeedingQuery.data?.beneficiaries.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {benNeedSearchDebounced ? t('categories.beneficiariesNeedingNoMatches') : t('categories.beneficiariesNeedingEmpty')}
                  </p>
                ) : (
                  <div
                    className={cn(
                      'space-y-3',
                      beneficiariesNeedingQuery.isPlaceholderData &&
                        beneficiariesNeedingQuery.isFetching &&
                        'opacity-[0.92] transition-opacity',
                    )}
                  >
                    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="border-b border-border bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 font-medium">{t('beneficiaries.colName')}</th>
                            <th className="px-3 py-2 font-medium">{t('beneficiaries.colPhone')}</th>
                            <th className="px-3 py-2 font-medium">{t('beneficiaries.colArea')}</th>
                            <th className="px-3 py-2 font-medium">{t('categories.beneficiariesNeedingColAddress')}</th>
                            <th className="px-3 py-2 font-medium">{t('beneficiaries.colFamily')}</th>
                            <th className="px-3 py-2 font-medium">{t('categories.beneficiariesNeedingColNeeds')}</th>
                            <th className="px-3 py-2 font-medium">{t('beneficiaries.colActions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(beneficiariesNeedingQuery.data?.beneficiaries ?? []).map((b) => (
                            <tr key={b.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-medium">{b.fullName}</td>
                              <td className="px-3 py-2 text-muted-foreground">{b.phone}</td>
                              <td className="px-3 py-2 text-muted-foreground">{b.area ?? t('common.dash')}</td>
                              <td className="px-3 py-2 text-muted-foreground">{b.street?.trim() ? b.street : t('common.dash')}</td>
                              <td className="px-3 py-2 text-muted-foreground">{b.familyCount}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                <ul className="list-inside list-disc space-y-0.5">
                                  {b.lines.map((ln, i) => (
                                    <li key={`${b.id}-${i}`}>
                                      <span className="text-foreground">{ln.itemName}</span>
                                      {ln.quantity >= 1 ? <span className="ms-1">×{ln.quantity}</span> : null}
                                      {ln.notes?.trim() ? <span className="ms-1 text-xs opacity-90">({ln.notes.trim()})</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  to={`/app/beneficiaries/${b.id}`}
                                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground transition hover:bg-muted"
                                >
                                  {t('categories.beneficiariesNeedingView')}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-3 md:hidden">
                      {(beneficiariesNeedingQuery.data?.beneficiaries ?? []).map((b) => (
                        <div
                          key={b.id}
                          className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm"
                        >
                          <div className="font-medium">{b.fullName}</div>
                          <div className="grid grid-cols-1 gap-1 text-muted-foreground">
                            <div>
                              <span className="text-foreground/80">{t('beneficiaries.colPhone')}: </span>
                              {b.phone}
                            </div>
                            <div>
                              <span className="text-foreground/80">{t('beneficiaries.colArea')}: </span>
                              {b.area ?? t('common.dash')}
                            </div>
                            <div>
                              <span className="text-foreground/80">{t('categories.beneficiariesNeedingColAddress')}: </span>
                              {b.street?.trim() ? b.street : t('common.dash')}
                            </div>
                            <div>
                              <span className="text-foreground/80">{t('beneficiaries.colFamily')}: </span>
                              {b.familyCount}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-foreground/80">{t('categories.beneficiariesNeedingColNeeds')}</div>
                            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                              {b.lines.map((ln, i) => (
                                <li key={`${b.id}-m-${i}`}>
                                  <span className="text-foreground">{ln.itemName}</span>
                                  {ln.quantity >= 1 ? <span className="ms-1">×{ln.quantity}</span> : null}
                                  {ln.notes?.trim() ? <span className="ms-1 text-xs opacity-90">({ln.notes.trim()})</span> : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <Link
                            to={`/app/beneficiaries/${b.id}`}
                            className="inline-flex h-8 w-full items-center justify-center rounded-md border border-border bg-card text-xs font-medium text-foreground transition hover:bg-muted"
                          >
                            {t('categories.beneficiariesNeedingView')}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t('categories.noCategorySelected')}</Card>
          )}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t('categories.empty')}</Card>
      )}

      <Dialog
        open={Boolean(catDlg)}
        onClose={() => setCatDlg(null)}
        title={catDlg === 'add' ? t('categories.dialogAddTitle') : t('categories.dialogEditTitle')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setCatDlg(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!catName.trim() || saveCategory.isPending} onClick={() => void saveCategory.mutateAsync()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('categories.fieldName')}</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('categories.fieldDescription')}</Label>
            <Input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} />
            {t('categories.fieldActive')}
          </label>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(itemDlg)}
        onClose={() => setItemDlg(null)}
        title={itemDlg?.mode === 'add' ? t('categories.dialogItemAdd') : t('categories.dialogItemEdit')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setItemDlg(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!itemName.trim() || saveItem.isPending} onClick={() => void saveItem.mutateAsync()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('categories.fieldItemName')}</Label>
            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('categories.defaultQty')}</Label>
            <Input type="number" min={1} value={itemDefQty} onChange={(e) => setItemDefQty(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div className="space-y-2">
            <Label>{t('categories.fieldUnit')}</Label>
            <select className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(delCat)}
        onClose={() => setDelCat(null)}
        title={t('categories.deleteCatTitle')}
        description={delCat?.name}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDelCat(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={delCatLoading} onClick={() => void confirmDeleteCategory()}>
              {delCatLoading ? t('common.saving') : t('common.delete')}
            </Button>
          </>
        }
      >
        <span className="sr-only">{delCat?.name}</span>
      </Dialog>

      <Dialog
        open={Boolean(delItem)}
        onClose={() => setDelItem(null)}
        title={t('categories.deleteItemTitle')}
        description={delItem?.name}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDelItem(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => delItem && deleteItem.mutate(delItem.id)}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <span className="sr-only">{delItem?.name}</span>
      </Dialog>
    </div>
  );
}
