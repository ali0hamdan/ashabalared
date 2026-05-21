import { BeneficiaryStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTableShell } from '@/components/layout/DataTableShell';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PaginationControls } from '@/components/pagination-controls';
import { BeneficiariesTableSkeleton } from '@/components/table-skeletons';
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/paginated';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';

type NotReceivedRow = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  street: string | null;
  householdSize: number;
  status: string;
  neededCategories: string[];
  lastReceivedAt: string | null;
  lastReceivedCategory: string | null;
  lastReceivedItems: string[];
  neverReceivedAny: boolean;
  notReceivedReason: string;
};

type AidCat = { id: string; name: string; isActive?: boolean };

type PeriodKey = 'all' | '7d' | '30d' | 'custom';
type SortByKey = 'lastReceivedAt' | 'createdAt' | 'fullName';

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWhen(iso: string | null | undefined, locale: string, neverLabel: string): string {
  if (!iso) return neverLabel;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return neverLabel;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function statusLabel(
  row: NotReceivedRow,
  t: TFunction,
  period: PeriodKey,
  selectedCategoryName: string | null,
): string {
  if (row.neverReceivedAny) return t('notReceived.statusNever');
  if (selectedCategoryName) {
    return t('notReceived.statusNotCategory', { category: selectedCategoryName });
  }
  if (period !== 'all') return t('notReceived.statusNotPeriod');
  return t('notReceived.statusNotReceived');
}

export function NotReceivedPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';
  const role = useAuthStore((s) => s.user?.roleCode);
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const [aidCategoryId, setAidCategoryId] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [dateFrom, setDateFrom] = useState(() => isoDateLocal(new Date()));
  const [dateTo, setDateTo] = useState(() => isoDateLocal(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortBy, setSortBy] = useState<SortByKey>('lastReceivedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [aidCategoryId, period, dateFrom, dateTo, searchDebounced, sortBy, sortDirection, includeInactive]);

  const { data: categories } = useQuery({
    queryKey: ['aid-categories', 'not-received'],
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const catOpts = useMemo(() => {
    const list = Array.isArray(categories) ? (categories as AidCat[]) : [];
    return [...list].filter((c) => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const selectedCategoryName = useMemo(() => {
    if (!aidCategoryId) return null;
    return catOpts.find((c) => c.id === aidCategoryId)?.name ?? null;
  }, [aidCategoryId, catOpts]);

  const { data, isPending, isFetching, isPlaceholderData } = useQuery({
    queryKey: [
      'beneficiaries-not-received',
      aidCategoryId,
      period,
      dateFrom,
      dateTo,
      searchDebounced,
      sortBy,
      sortDirection,
      includeInactive,
      page,
      pageSize,
    ],
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<NotReceivedRow>>('/beneficiaries/not-received', {
          params: {
            aidCategoryId: aidCategoryId || undefined,
            period,
            dateFrom: period === 'custom' ? dateFrom : undefined,
            dateTo: period === 'custom' ? dateTo : undefined,
            search: searchDebounced || undefined,
            sortBy,
            sortDirection,
            includeInactive: isSuperAdmin && includeInactive ? 'true' : undefined,
            page,
            limit: pageSize,
          },
        })
      ).data,
  });

  const showInitialSkeleton = isPending && !isPlaceholderData;
  const rows = data?.data ?? [];
  const totalPages = data?.totalPages ?? 0;
  const neverLabel = t('notReceived.never');

  return (
    <div className="space-y-4">
      <PageHeader title={t('notReceived.title')} description={t('notReceived.subtitle')} />

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs">{t('notReceived.filterCategory')}</Label>
            <select
              className="form-select h-10 w-full"
              value={aidCategoryId}
              onChange={(e) => setAidCategoryId(e.target.value)}
            >
              <option value="">{t('notReceived.allCategories')}</option>
              {catOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('notReceived.filterPeriod')}</Label>
            <select
              className="form-select h-10 w-full"
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            >
              <option value="all">{t('notReceived.periodAll')}</option>
              <option value="7d">{t('notReceived.period7d')}</option>
              <option value="30d">{t('notReceived.period30d')}</option>
              <option value="custom">{t('notReceived.periodCustom')}</option>
            </select>
          </div>
          {period === 'custom' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('notReceived.dateFrom')}</Label>
                <Input type="date" className="h-10" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('notReceived.dateTo')}</Label>
                <Input type="date" className="h-10" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <Label className="text-xs">{t('notReceived.searchLabel')}</Label>
            <Input
              className="h-10"
              placeholder={t('notReceived.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('notReceived.sortBy')}</Label>
            <select
              className="form-select h-10 w-full"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortByKey)}
            >
              <option value="lastReceivedAt">{t('notReceived.sortLastReceived')}</option>
              <option value="createdAt">{t('notReceived.sortCreated')}</option>
              <option value="fullName">{t('notReceived.sortName')}</option>
            </select>
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            <Label className="text-xs">{t('notReceived.sortDirection')}</Label>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start gap-2"
              onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              {sortDirection === 'asc' ? (
                <ArrowDownAZ className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <ArrowUpAZ className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {sortDirection === 'asc' ? t('notReceived.sortAsc') : t('notReceived.sortDesc')}
            </Button>
          </div>
          {isSuperAdmin ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              {t('notReceived.includeInactive')}
            </label>
          ) : null}
        </div>
        {data && !showInitialSkeleton ? (
          <p className="text-sm text-muted-foreground">
            {t('notReceived.resultSummary', { total: data.total ?? 0 })}
          </p>
        ) : null}
      </Card>

      <DataTableShell
        className={cn(isPlaceholderData && isFetching && 'opacity-[0.92] transition-opacity')}
      >
        {showInitialSkeleton ? (
          <div aria-busy aria-label={t('common.loading')}>
            <BeneficiariesTableSkeleton rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('notReceived.empty')} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-muted/40 text-start">
                  <tr className="border-b border-border">
                    <th className="p-3">{t('notReceived.colName')}</th>
                    <th className="p-3">{t('notReceived.colPhone')}</th>
                    <th className="p-3">{t('notReceived.colAddress')}</th>
                    <th className="p-3">{t('notReceived.colHousehold')}</th>
                    <th className="p-3">{t('notReceived.colNeeds')}</th>
                    <th className="p-3">{t('notReceived.colLastReceived')}</th>
                    <th className="p-3">{t('notReceived.colLastAid')}</th>
                    <th className="p-3">{t('notReceived.colStatus')}</th>
                    <th className="p-3">{t('notReceived.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-b border-border align-top hover:bg-muted/20">
                      <td className="p-3 font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          to={`/app/beneficiaries/${b.id}`}
                        >
                          {b.fullName}
                        </Link>
                      </td>
                      <td className="p-3 whitespace-nowrap tabular-nums">{b.phone}</td>
                      <td className="p-3 max-w-[14rem]">
                        <div className="space-y-0.5 text-sm">
                          {b.area?.trim() ? (
                            <div>
                              <span className="text-muted-foreground">{t('beneficiaryNew.area')}: </span>
                              {b.area}
                            </div>
                          ) : null}
                          {b.street?.trim() ? (
                            <div className="whitespace-pre-wrap text-xs">{b.street}</div>
                          ) : null}
                          {!b.area?.trim() && !b.street?.trim() ? t('common.dash') : null}
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{b.householdSize}</td>
                      <td className="p-3">
                        {b.neededCategories.length ? (
                          <div className="flex max-w-[12rem] flex-wrap gap-1">
                            {b.neededCategories.slice(0, 4).map((name) => (
                              <span
                                key={name}
                                className="inline-block max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-xs"
                                title={name}
                              >
                                {name}
                              </span>
                            ))}
                            {b.neededCategories.length > 4 ? (
                              <span className="text-xs text-muted-foreground">+{b.neededCategories.length - 4}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('common.dash')}</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {formatWhen(b.lastReceivedAt, locale, neverLabel)}
                      </td>
                      <td className="p-3 max-w-[12rem] text-xs">
                        {b.neverReceivedAny ? (
                          <span className="text-muted-foreground">{neverLabel}</span>
                        ) : (
                          <div className="space-y-0.5">
                            {b.lastReceivedCategory ? (
                              <div className="font-medium text-foreground">{b.lastReceivedCategory}</div>
                            ) : null}
                            {b.lastReceivedItems.length ? (
                              <div className="text-muted-foreground">{b.lastReceivedItems.join(', ')}</div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-inset ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-100">
                            {statusLabel(b, t, period, selectedCategoryName)}
                          </span>
                          <BeneficiaryStatusBadge status={b.status} />
                        </div>
                      </td>
                      <td className="p-3 space-y-2">
                        <Link
                          to={`/app/beneficiaries/${b.id}`}
                          className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/60"
                        >
                          {t('notReceived.actionView')}
                        </Link>
                        <Link
                          to="/app/distributions/new"
                          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-95"
                        >
                          {t('notReceived.actionDistribute')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 p-3">
              {rows.map((b) => (
                <Card key={b.id} className="space-y-3 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link className="font-semibold text-primary" to={`/app/beneficiaries/${b.id}`}>
                      {b.fullName}
                    </Link>
                    <BeneficiaryStatusBadge status={b.status} />
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {statusLabel(b, t, period, selectedCategoryName)}
                  </p>
                  <dl className="grid gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t('notReceived.colPhone')}</dt>
                      <dd>{b.phone}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('notReceived.colLastReceived')}</dt>
                      <dd>{formatWhen(b.lastReceivedAt, locale, neverLabel)}</dd>
                    </div>
                  </dl>
                  <div className="flex gap-2">
                    <Link
                      to={`/app/beneficiaries/${b.id}`}
                      className="flex-1 rounded-md border border-border py-2 text-center text-xs font-medium"
                    >
                      {t('notReceived.actionView')}
                    </Link>
                    <Link
                      to="/app/distributions/new"
                      className="flex-1 rounded-md bg-primary py-2 text-center text-xs font-medium text-primary-foreground"
                    >
                      {t('notReceived.actionDistribute')}
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            {data && totalPages > 1 ? (
              <PaginationControls
                page={page}
                totalPages={totalPages}
                isFetching={isFetching && !showInitialSkeleton}
                summary={t('notReceived.pagingSummary', {
                  page,
                  totalPages,
                  total: data.total ?? 0,
                })}
                prevLabel={t('notReceived.pagingPrev')}
                nextLabel={t('notReceived.pagingNext')}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            ) : null}
          </>
        )}
      </DataTableShell>
    </div>
  );
}
