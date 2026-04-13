import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { DistributionStatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

export function BeneficiariesHistoryPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['beneficiaries-history'],
    queryFn: async () => (await api.get<HistoryRow[]>('/beneficiaries-history')).data,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((b) => {
      const name = (b.fullName ?? '').toLowerCase();
      const phone = (b.phone ?? '').toLowerCase();
      const area = (b.area ?? '').toLowerCase();
      return name.includes(s) || phone.includes(s) || area.includes(s);
    });
  }, [rows, q]);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('beneficiariesHistory.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('beneficiariesHistory.subtitle')}</p>
      </div>

      <Card className="p-4">
        <Label className="text-sm font-medium">{t('beneficiariesHistory.searchLabel')}</Label>
        <Input
          className="mt-2 max-w-md"
          placeholder={t('beneficiariesHistory.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? t('beneficiariesHistory.emptyDb') : t('beneficiariesHistory.empty')}
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((b) => {
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
