import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DistributionStatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

type HistoryLine = { itemName: string; quantity: number };
type HistoryDelivery = {
  id: string;
  deliveredAt: string | null;
  status: string;
  driverDisplayName: string | null;
  driverUsername: string | null;
  completedByDisplayName: string | null;
  lines: HistoryLine[];
};
type HistoryRow = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  familyCount: number;
  totalDeliveredDistributions: number;
  lastDeliveredAt: string | null;
  deliveries: HistoryDelivery[];
};

type AidCat = {
  id: string;
  name: string;
  isActive?: boolean;
  items?: Array<{ id: string; name: string; sortOrder?: number }>;
};

export function BeneficiariesHistoryPage() {
  const { t, i18n } = useTranslation();
  const [qInput, setQInput] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [aidCategoryId, setAidCategoryId] = useState('');
  const [aidCategoryItemId, setAidCategoryItemId] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const tmr = window.setTimeout(() => setQDebounced(qInput.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [qInput]);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'beneficiaries-history-filters'],
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const catOpts = useMemo(() => {
    const list = Array.isArray(categories) ? (categories as AidCat[]) : [];
    return [...list].filter((c) => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const itemOpts = useMemo(() => {
    const c = catOpts.find((x) => x.id === aidCategoryId);
    return [...(c?.items ?? [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );
  }, [catOpts, aidCategoryId]);

  useEffect(() => {
    if (!aidCategoryId) {
      setAidCategoryItemId('');
      return;
    }
    if (aidCategoryItemId && !itemOpts.some((it) => it.id === aidCategoryItemId)) {
      setAidCategoryItemId('');
    }
  }, [aidCategoryId, aidCategoryItemId, itemOpts]);

  const { data, isLoading } = useQuery({
    queryKey: ['beneficiaries-history', qDebounced, aidCategoryId, aidCategoryItemId],
    queryFn: async () =>
      (
        await api.get<HistoryRow[]>('/beneficiaries-history', {
          params: {
            q: qDebounced || undefined,
            aidCategoryId: aidCategoryId || undefined,
            aidCategoryItemId: aidCategoryItemId || undefined,
          },
        })
      ).data,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const dateLocale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';

  function toggle(id: string) {
    setOpen((m) => ({ ...m, [id]: !m[id] }));
  }

  function driverLabel(d: HistoryDelivery): string {
    if (d.driverDisplayName?.trim()) return d.driverDisplayName;
    if (d.driverUsername?.trim()) return d.driverUsername;
    if (d.completedByDisplayName?.trim()) return d.completedByDisplayName;
    return t('common.dash');
  }

  function clearFilters() {
    setQInput('');
    setQDebounced('');
    setAidCategoryId('');
    setAidCategoryItemId('');
  }

  const hasActiveFilters = Boolean(qDebounced || aidCategoryId || aidCategoryItemId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('beneficiariesHistory.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('beneficiariesHistory.subtitle')}</p>
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <CardTitle className="text-base">{t('beneficiariesHistory.filtersTitle')}</CardTitle>
          <CardDescription className="mt-1">{t('beneficiariesHistory.filtersDesc')}</CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-medium">{t('beneficiariesHistory.searchLabel')}</Label>
            <Input
              placeholder={t('beneficiariesHistory.searchPlaceholder')}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('beneficiariesHistory.filterCategory')}</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={aidCategoryId}
              onChange={(e) => {
                setAidCategoryId(e.target.value);
                setAidCategoryItemId('');
              }}
            >
              <option value="">{t('beneficiariesHistory.filterCategoryAll')}</option>
              {catOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('beneficiariesHistory.filterItem')}</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm disabled:opacity-60"
              value={aidCategoryItemId}
              disabled={!aidCategoryId}
              onChange={(e) => setAidCategoryItemId(e.target.value)}
            >
              <option value="">{t('beneficiariesHistory.filterItemAll')}</option>
              {itemOpts.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            {!aidCategoryId ? <p className="text-xs text-muted-foreground">{t('beneficiariesHistory.filterItemHint')}</p> : null}
          </div>
        </div>
        {hasActiveFilters ? (
          <Button type="button" variant="outline" className="h-9 text-xs" onClick={() => clearFilters()}>
            {t('beneficiariesHistory.filterClear')}
          </Button>
        ) : null}
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {!hasActiveFilters ? t('beneficiariesHistory.emptyDb') : t('beneficiariesHistory.empty')}
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => {
            const expanded = Boolean(open[b.id]);
            return (
              <li key={b.id}>
                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-semibold">{b.fullName}</div>
                      <div className="text-sm text-muted-foreground">
                        {t('beneficiariesHistory.phone')}: {b.phone || t('common.dash')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t('beneficiariesHistory.area')}: {b.area?.trim() ? b.area : t('common.dash')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t('beneficiariesHistory.household')}: {b.familyCount}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">{t('beneficiariesHistory.deliveriesCount')}: </span>
                        <span className="font-medium">{b.totalDeliveredDistributions}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">{t('beneficiariesHistory.lastDelivery')}: </span>
                        <span className="font-medium">
                          {b.lastDeliveredAt
                            ? new Date(b.lastDeliveredAt).toLocaleString(dateLocale, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : t('common.dash')}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 gap-1 self-start px-3 text-xs"
                      onClick={() => toggle(b.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {t('beneficiariesHistory.toggleHistory')}
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-border bg-muted/20 px-4 py-4">
                      <CardTitle className="text-base">{t('beneficiariesHistory.historyTitle')}</CardTitle>
                      <CardDescription className="mt-1">{t('beneficiariesHistory.historyDesc')}</CardDescription>
                      {b.deliveries.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">{t('beneficiariesHistory.noDeliveriesYet')}</p>
                      ) : (
                        <ol className="mt-4 space-y-4">
                          {b.deliveries.map((d) => (
                            <li key={d.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {d.deliveredAt
                                    ? new Date(d.deliveredAt).toLocaleString(dateLocale, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : t('common.dash')}
                                </span>
                                <DistributionStatusBadge status={d.status} />
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {t('beneficiariesHistory.by')}: {driverLabel(d)}
                              </div>
                              <ul className="mt-2 space-y-1 ps-4 list-disc">
                                {d.lines.length === 0 ? (
                                  <li className="text-muted-foreground">{t('beneficiariesHistory.noLines')}</li>
                                ) : (
                                  d.lines.map((line, idx) => (
                                    <li key={idx}>
                                      <span className="font-medium">{line.itemName}</span>
                                      <span className="text-muted-foreground"> × {line.quantity}</span>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
