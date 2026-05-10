import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DistributionsTableSkeleton } from '@/components/table-skeletons';
import { PaginationControls } from '@/components/pagination-controls';
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/paginated';
import { normalizeAidCategoriesForForm } from '@/lib/beneficiaryItemNeeds';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

type WeeklyTrackingRow = {
  distributionId: string;
  beneficiary: {
    id: string;
    fullName: string;
    phone: string;
    area: string | null;
    street: string | null;
    householdSize: number;
  };
  aidCategory: { id: string; name: string };
  items: Array<{
    lineId: string;
    aidCategoryItemId: string | null;
    itemName: string;
    quantityDelivered: number;
    quantityPlanned: number;
  }>;
  driver: { id: string; displayName: string; username: string } | null;
  confirmedBy: { id: string; displayName: string; username: string } | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  status: 'PENDING' | 'ASSIGNED' | 'DELIVERED' | 'CANCELLED';
  activityAt: string;
};

type DriverOption = { id: string; displayName: string; username: string };

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeLast7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}

function rangeToday(): { from: string; to: string } {
  const d = new Date();
  const s = isoDateLocal(d);
  return { from: s, to: s };
}

function rangeYesterday(): { from: string; to: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = isoDateLocal(d);
  return { from: s, to: s };
}

function trimText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  return s;
}

function formatItemsSummary(row: WeeklyTrackingRow, t: TFunction): string {
  const parts = row.items.map((it) => {
    const name = trimText(it.itemName) || t('weeklyTracking.unnamedItem');
    const q =
      row.status === 'DELIVERED'
        ? it.quantityDelivered
        : Math.max(it.quantityPlanned, it.quantityDelivered);
    return `${q} × ${name}`;
  });
  return parts.join(', ');
}

function formatWhen(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function personLabel(
  u: { displayName?: string | null; username?: string | null } | null | undefined,
  empty: string,
): string {
  if (!u) return empty;
  const dn = trimText(u.displayName);
  if (dn) return dn;
  const un = trimText(u.username);
  if (un) return un;
  return empty;
}

export function WeeklyTrackingPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';
  const role = useAuthStore((s) => s.user?.roleCode);
  const canFilterDriver = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const [categoryTab, setCategoryTab] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('received');
  const [datePreset, setDatePreset] = useState<'last7' | 'today' | 'yesterday' | 'custom'>('last7');
  const [dateFrom, setDateFrom] = useState(() => rangeLast7Days().from);
  const [dateTo, setDateTo] = useState(() => rangeLast7Days().to);
  const [driverId, setDriverId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  useEffect(() => {
    queueMicrotask(() => {
      setPage(1);
    });
  }, [categoryTab, searchDebounced, statusFilter, dateFrom, dateTo, driverId]);

  const { data: categories } = useQuery({
    queryKey: ['aid-categories', 'weekly-tracking'],
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const catRows = useMemo(() => normalizeAidCategoriesForForm(categories), [categories]);

  const { data: drivers } = useQuery({
    queryKey: ['users', 'delivery-drivers', role],
    queryFn: async () =>
      (
        await api.get<DriverOption[]>('/users', {
          params: role === 'SUPER_ADMIN' ? { role: 'DELIVERY' } : undefined,
        })
      ).data,
    enabled: canFilterDriver,
  });

  const trackingQuery = useQuery({
    queryKey: [
      'weekly-tracking',
      categoryTab,
      searchDebounced,
      statusFilter,
      dateFrom,
      dateTo,
      driverId,
      page,
      pageSize,
    ],
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<WeeklyTrackingRow>>('/distributions/weekly-tracking', {
        params: {
          aidCategoryId: categoryTab || undefined,
          search: searchDebounced || undefined,
          status: statusFilter || undefined,
          dateFrom,
          dateTo,
          driverId: driverId || undefined,
          page: String(page),
          limit: String(pageSize),
        },
      });
      return res.data;
    },
  });

  const showInitialSkeleton = trackingQuery.isPending && !trackingQuery.isPlaceholderData;
  const rows = trackingQuery.data?.data ?? [];
  const totalPages = trackingQuery.data?.totalPages ?? 0;

  function applyPreset(p: typeof datePreset) {
    setDatePreset(p);
    if (p === 'last7') {
      const r = rangeLast7Days();
      setDateFrom(r.from);
      setDateTo(r.to);
    } else if (p === 'today') {
      const r = rangeToday();
      setDateFrom(r.from);
      setDateTo(r.to);
    } else if (p === 'yesterday') {
      const r = rangeYesterday();
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.09] text-primary ring-1 ring-inset ring-primary/15">
          <CalendarDays className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1 border-b border-border/60 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t('weeklyTracking.title')}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('weeklyTracking.subtitle')}</p>
        </div>
      </div>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">{t('weeklyTracking.categoryTabs')}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-xs sm:text-sm"
              variant={categoryTab === '' ? 'primary' : 'outline'}
              onClick={() => setCategoryTab('')}
            >
              {t('weeklyTracking.tabAll')}
            </Button>
            {catRows.map((c) => (
              <Button
                key={c.id}
                type="button"
                className="h-8 px-3 text-xs sm:text-sm"
                variant={categoryTab === c.id ? 'primary' : 'outline'}
                onClick={() => setCategoryTab(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2 lg:col-span-2 xl:col-span-1">
            <Label htmlFor="weekly-search">{t('weeklyTracking.searchLabel')}</Label>
            <Input
              id="weekly-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('weeklyTracking.searchPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('weeklyTracking.statusFilter')}</Label>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="received">{t('weeklyTracking.statusReceived')}</option>
              <option value="pending">{t('weeklyTracking.statusPending')}</option>
              <option value="cancelled">{t('weeklyTracking.statusCancelled')}</option>
              <option value="all">{t('weeklyTracking.statusAll')}</option>
            </select>
          </div>
          {canFilterDriver ? (
            <div className="space-y-2">
              <Label>{t('weeklyTracking.driverFilter')}</Label>
              <select
                className="form-select"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">{t('weeklyTracking.driverAll')}</option>
                {(drivers ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {personLabel(d, d.username)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{t('weeklyTracking.dateRange')}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-xs sm:text-sm"
              variant={datePreset === 'last7' ? 'primary' : 'outline'}
              onClick={() => applyPreset('last7')}
            >
              {t('weeklyTracking.presetLast7')}
            </Button>
            <Button
              type="button"
              className="h-8 px-3 text-xs sm:text-sm"
              variant={datePreset === 'today' ? 'primary' : 'outline'}
              onClick={() => applyPreset('today')}
            >
              {t('weeklyTracking.presetToday')}
            </Button>
            <Button
              type="button"
              className="h-8 px-3 text-xs sm:text-sm"
              variant={datePreset === 'yesterday' ? 'primary' : 'outline'}
              onClick={() => applyPreset('yesterday')}
            >
              {t('weeklyTracking.presetYesterday')}
            </Button>
            <Button
              type="button"
              className="h-8 px-3 text-xs sm:text-sm"
              variant={datePreset === 'custom' ? 'primary' : 'outline'}
              onClick={() => setDatePreset('custom')}
            >
              {t('weeklyTracking.presetCustom')}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('weeklyTracking.dateFrom')}</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDateFrom(e.target.value);
                }}
                className="h-10 w-[11rem]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('weeklyTracking.dateTo')}</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDateTo(e.target.value);
                }}
                className="h-10 w-[11rem]"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {showInitialSkeleton ? (
          <div className="p-4">
            <DistributionsTableSkeleton rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {(() => {
              const noExtraFilters =
                !searchDebounced && !driverId && statusFilter === 'received';
              if (categoryTab && noExtraFilters) return t('weeklyTracking.emptyCategory');
              if (!categoryTab && noExtraFilters) return t('weeklyTracking.empty');
              return t('weeklyTracking.emptyFiltered');
            })()}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-start">
                    <th className="p-3 font-medium">{t('weeklyTracking.colBeneficiary')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colPhone')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colAddress')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colHousehold')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colCategory')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colItems')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colDriver')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colConfirmedBy')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colDeliveredAt')}</th>
                    <th className="p-3 font-medium">{t('weeklyTracking.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const st = row.status;
                    const rowTone =
                      st === 'DELIVERED'
                        ? 'border-s-4 border-s-emerald-500/90 bg-emerald-500/[0.06]'
                        : st === 'PENDING' || st === 'ASSIGNED'
                          ? 'border-s-4 border-s-amber-500/90 bg-amber-500/[0.06]'
                          : st === 'CANCELLED'
                            ? 'border-s-4 border-s-rose-500/70 bg-rose-500/[0.05]'
                            : '';
                    const when =
                      st === 'DELIVERED'
                        ? formatWhen(row.deliveredAt ?? row.activityAt, locale)
                        : st === 'CANCELLED'
                          ? formatWhen(row.cancelledAt ?? row.activityAt, locale)
                          : formatWhen(row.activityAt, locale);
                    const badge =
                      st === 'DELIVERED' ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-600/15 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          {t('weeklyTracking.badgeReceived')}
                        </span>
                      ) : st === 'PENDING' || st === 'ASSIGNED' ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">
                          {t('weeklyTracking.badgePending')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-900 dark:text-rose-100">
                          {t('weeklyTracking.badgeCancelled')}
                        </span>
                      );
                    const area = trimText(row.beneficiary.area);
                    const street = trimText(row.beneficiary.street);
                    return (
                      <tr key={`${row.distributionId}-${row.aidCategory.id}`} className={cn('border-b border-border align-top', rowTone)}>
                        <td className="p-3 font-medium">{trimText(row.beneficiary.fullName) || t('common.dash')}</td>
                        <td className="p-3 whitespace-nowrap">{trimText(row.beneficiary.phone) || t('common.dash')}</td>
                        <td className="p-3">
                          {area || street ? (
                            <div className="max-w-[14rem] space-y-0.5">
                              {area ? <div>{area}</div> : null}
                              {street ? <div className="text-xs text-muted-foreground">{street}</div> : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{t('common.dash')}</span>
                          )}
                        </td>
                        <td className="p-3 tabular-nums">{row.beneficiary.householdSize ?? t('common.dash')}</td>
                        <td className="p-3">{trimText(row.aidCategory.name) || t('common.dash')}</td>
                        <td className="p-3 text-muted-foreground">{formatItemsSummary(row, t)}</td>
                        <td className="p-3">{personLabel(row.driver, t('common.dash'))}</td>
                        <td className="p-3">{personLabel(row.confirmedBy, t('common.dash'))}</td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{when || t('common.dash')}</td>
                        <td className="p-3">{badge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationControls
              className="px-3"
              summary={t('weeklyTracking.pagingSummary', {
                page: trackingQuery.data?.page ?? page,
                totalPages: totalPages || 1,
                total: trackingQuery.data?.total ?? 0,
              })}
              page={trackingQuery.data?.page ?? page}
              totalPages={Math.max(1, totalPages)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              prevLabel={t('weeklyTracking.pagingPrev')}
              nextLabel={t('weeklyTracking.pagingNext')}
              isFetching={trackingQuery.isFetching && !showInitialSkeleton}
            />
          </>
        )}
      </Card>
    </div>
  );
}
