import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { PaginatedResponse } from '@/lib/paginated';
import type {
  BeneficiaryNeedRow,
  BeneficiaryNeedsResponse,
  BeneficiaryPickRow,
  RecentAidCategory,
  RecentAidResponse,
  StockRowForSelect,
} from '@/types/api-shapes';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale/ar';
import { enUS } from 'date-fns/locale/en-US';

type Line = { stockItemId: string; quantity: number };

function formatBeneficiaryAddressLines(b: {
  area?: string | null;
  region?: { nameAr?: string | null; nameEn?: string | null } | null;
  street?: string | null;
  addressLine?: string | null;
}): string {
  const area =
    (typeof b.area === 'string' ? b.area : '').trim() ||
    (b.region?.nameAr ?? '').trim() ||
    (b.region?.nameEn ?? '').trim() ||
    '';
  const rawStreet =
    typeof b.street === 'string' ? b.street : typeof b.addressLine === 'string' ? b.addressLine : '';
  const street = rawStreet.trim();
  if (area && street) return `${area} / ${street}`;
  return area || street || '';
}

export function DistributionNewPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ stockItemId: '', quantity: 1 }]);
  const [saving, setSaving] = useState(false);
  const [recentAidAck, setRecentAidAck] = useState(false);
  const [filterSuggestedOnly, setFilterSuggestedOnly] = useState(false);
  const [benSearchInput, setBenSearchInput] = useState('');
  const [benSearchDebounced, setBenSearchDebounced] = useState('');
  const [selectedPick, setSelectedPick] = useState<{
    id: string;
    line1: string;
    line2: string;
  } | null>(null);

  useEffect(() => {
    const tmr = window.setTimeout(() => setBenSearchDebounced(benSearchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [benSearchInput]);

  const [benPage, setBenPage] = useState(1);
  const benLimit = 20;

  useEffect(() => {
    setBenPage(1);
  }, [benSearchDebounced]);

  const { data: benPayload, isLoading: benLoading, isFetching: benFetching } = useQuery({
    queryKey: ['beneficiaries', 'dist-new', { forSelection: true, activeOnly: true, search: benSearchDebounced, page: benPage }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<BeneficiaryPickRow>>('/beneficiaries', {
          params: {
            forSelection: true,
            activeOnly: true,
            search: benSearchDebounced || undefined,
            limit: benLimit,
            page: benPage,
          },
        })
      ).data,
    placeholderData: (prev) => prev,
  });
  const benRows = useMemo(() => benPayload?.data ?? [], [benPayload?.data]);
  const benTotalPages = benPayload?.totalPages ?? 0;

  useEffect(() => {
    if (!beneficiaryId) {
      queueMicrotask(() => setSelectedPick(null));
      return;
    }
    if (selectedPick?.id === beneficiaryId) return;
    const b = benRows.find((x) => x.id === beneficiaryId);
    if (b) {
      queueMicrotask(() =>
        setSelectedPick({
          id: b.id,
          line1: `${b.fullName} — ${b.phone}`,
          line2: formatBeneficiaryAddressLines(b),
        }),
      );
    }
  }, [beneficiaryId, benRows, selectedPick?.id]);

  function pickBeneficiary(b: {
    id: string;
    fullName: string;
    phone: string;
    area?: string | null;
    region?: { nameAr?: string | null; nameEn?: string | null } | null;
    street?: string | null;
    addressLine?: string | null;
  }) {
    setBeneficiaryId(b.id);
    setSelectedPick({
      id: b.id,
      line1: `${b.fullName} — ${b.phone}`,
      line2: formatBeneficiaryAddressLines(b),
    });
  }

  const { data: stockRows, isLoading: stockLoading } = useQuery({
    queryKey: ['stock', 'dist-new'],
    enabled: step >= 2,
    queryFn: async () => (await api.get<StockRowForSelect[]>('/stock', { params: { hasAvailable: 'true' } })).data,
  });
  const stocks = useMemo((): StockRowForSelect[] => (Array.isArray(stockRows) ? stockRows : []), [stockRows]);

  const { data: needsPayload, isLoading: needsLoading } = useQuery({
    queryKey: ['beneficiary', beneficiaryId, 'needs'],
    enabled: Boolean(beneficiaryId),
    queryFn: async () =>
      (await api.get<BeneficiaryNeedsResponse>(`/beneficiaries/${beneficiaryId}/needs`)).data,
  });

  const needRows = useMemo((): BeneficiaryNeedRow[] => {
    const n = needsPayload?.needs;
    return Array.isArray(n) ? n : [];
  }, [needsPayload]);

  const suggestedCategoryIds = useMemo(() => new Set(needRows.map((n) => n.aidCategoryId)), [needRows]);

  const suggestedCategoryLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of needRows) {
      if (!m.has(n.aidCategoryId)) m.set(n.aidCategoryId, n.aidCategoryName);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [needRows]);

  const stockOptions = useMemo(() => {
    return stocks.map((s) => {
      const cid =
        s.aidCategoryItem?.aidCategoryId ?? s.aidCategoryItem?.aidCategory?.id ?? '';
      const suggested = Boolean(cid && suggestedCategoryIds.has(cid));
      const base = `${s.aidCategoryItem?.aidCategory?.name ?? ''} — ${s.aidCategoryItem?.name ?? s.id} (${s.availableQuantity})`;
      const label = suggested ? `${t('distributionNew.suggestedBadge')} · ${base}` : base;
      return {
        id: s.id,
        label,
        suggested,
      };
    });
  }, [stocks, suggestedCategoryIds, t]);

  const stockOptionsForSelect = useMemo(() => {
    const selectedStockIds = new Set(lines.map((l) => l.stockItemId).filter(Boolean));
    let opts = stockOptions;
    if (filterSuggestedOnly) {
      opts = stockOptions.filter((o) => o.suggested || selectedStockIds.has(o.id));
    }
    return opts;
  }, [stockOptions, filterSuggestedOnly, lines]);

  const selectedAidCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of lines) {
      if (!line.stockItemId) continue;
      const s = stocks.find((x) => x.id === line.stockItemId);
      const cid =
        s?.aidCategoryItem?.aidCategoryId ?? s?.aidCategoryItem?.aidCategory?.id ?? '';
      if (cid) ids.add(cid);
    }
    return [...ids].sort();
  }, [lines, stocks]);

  const recentAidCategoryKey = selectedAidCategoryIds.join(',');

  const {
    data: recentAid,
    isFetching: recentAidFetching,
  } = useQuery({
    queryKey: ['beneficiary', beneficiaryId, 'recent-aid', 7, recentAidCategoryKey],
    enabled: step >= 3 && Boolean(beneficiaryId) && selectedAidCategoryIds.length > 0,
    queryFn: async () =>
      (
        await api.get<RecentAidResponse>(`/beneficiaries/${beneficiaryId}/recent-aid`, {
          params: { days: 7, categoryIds: recentAidCategoryKey },
        })
      ).data,
  });

  const recentWarnings = useMemo((): RecentAidCategory[] => {
    if (step < 3 || !beneficiaryId || selectedAidCategoryIds.length === 0) return [];
    return recentAid?.categories ?? [];
  }, [step, beneficiaryId, selectedAidCategoryIds.length, recentAid]);

  useEffect(() => {
    setRecentAidAck(false);
  }, [beneficiaryId, recentAidCategoryKey]);

  useEffect(() => {
    setFilterSuggestedOnly(false);
  }, [beneficiaryId]);

  function applySuggestedItems() {
    if (!needRows.length) {
      toast.warning(t('distributionNew.noRecordedNeedsBeneficiary'));
      return;
    }
    if (!stocks.length) {
      toast.warning(t('distributionNew.noStock'));
      return;
    }
    const newLines: Line[] = [];
    for (const need of needRows) {
      let match: StockRowForSelect | undefined;
      if (need.itemId) {
        match = stocks.find(
          (s) =>
            s.aidCategoryItem?.id === need.itemId &&
            (s.availableQuantity ?? 0) > 0,
        );
      }
      if (!match) {
        match = stocks.find(
          (s) =>
            (s.aidCategoryItem?.aidCategoryId === need.aidCategoryId ||
              s.aidCategoryItem?.aidCategory?.id === need.aidCategoryId) &&
            (s.availableQuantity ?? 0) > 0,
        );
      }
      const qty = Math.max(1, need.quantity >= 1 ? need.quantity : 1);
      newLines.push({ stockItemId: match?.id ?? '', quantity: qty });
    }
    if (newLines.length) setLines(newLines);
    if (newLines.some((l) => !l.stockItemId)) {
      toast.info(t('distributionNew.prefillNeedPickStock'));
    }
  }

  function addLine() {
    setLines((ls) => [...ls, { stockItemId: '', quantity: 1 }]);
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, j) => j !== i));
  }

  async function submit() {
    const cleaned = lines.filter((l) => l.stockItemId && l.quantity >= 1);
    if (!beneficiaryId) {
      toast.error(t('distributionNew.pickBeneficiary'));
      return;
    }
    if (cleaned.length === 0) {
      toast.error(t('distributionNew.needLines'));
      return;
    }
    if (selectedAidCategoryIds.length > 0 && recentAidFetching) {
      toast.info(t('distributionNew.recentAidChecking'));
      return;
    }
    if (recentWarnings.length > 0 && !recentAidAck) {
      toast.error(t('distributionNew.recentAidMustAcknowledge'));
      return;
    }
    const seen = new Set<string>();
    for (const l of cleaned) {
      if (seen.has(l.stockItemId)) {
        toast.error(t('distributionNew.duplicateStock'));
        return;
      }
      seen.add(l.stockItemId);
    }
    setSaving(true);
    try {
      await api.post('/distributions', {
        beneficiaryId,
        notes: notes || undefined,
        items: cleaned.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })),
      });
      toast.success(t('distributionNew.success'));
      await qc.invalidateQueries({ queryKey: ['distributions'] });
      navigate('/app/distributions');
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('distributionNew.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('distributionNew.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={step === 1 ? 'font-semibold text-primary' : 'text-muted-foreground'}>1. {t('distributionNew.step1')}</span>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <span className={step === 2 ? 'font-semibold text-primary' : 'text-muted-foreground'}>2. {t('distributionNew.step2')}</span>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <span className={step === 3 ? 'font-semibold text-primary' : 'text-muted-foreground'}>3. {t('distributionNew.step3')}</span>
      </div>

      {step === 1 ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t('distributionNew.step1')}</CardTitle>
          <CardDescription>{t('distributionNew.step1Desc')}</CardDescription>
          {benLoading && !benPayload ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <div className="space-y-3">
              <Label>{t('distributionNew.beneficiary')}</Label>
              <Input
                className="max-w-xl"
                placeholder={t('distributionNew.beneficiarySearchPlaceholder')}
                value={benSearchInput}
                onChange={(e) => setBenSearchInput(e.target.value)}
                aria-label={t('distributionNew.beneficiarySearchPlaceholder')}
              />
              {selectedPick ? (
                <div className="max-w-xl rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <div className="font-medium">{selectedPick.line1}</div>
                  {selectedPick.line2 ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{selectedPick.line2}</div>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setBeneficiaryId('');
                      setSelectedPick(null);
                    }}
                  >
                    {t('distributionNew.clearBeneficiarySelection')}
                  </Button>
                </div>
              ) : null}
              <div
                className={cn(
                  'max-h-72 max-w-xl overflow-y-auto rounded-md border border-border',
                  benFetching && 'opacity-70',
                )}
              >
                {benRows.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">{t('distributionNew.beneficiaryListEmpty')}</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {benRows.map((b) => {
                      const sub = formatBeneficiaryAddressLines(b);
                      return (
                        <li key={b.id}>
                          <button
                            type="button"
                            className={cn(
                              'w-full px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted/50',
                              beneficiaryId === b.id && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                            )}
                            onClick={() => pickBeneficiary(b)}
                          >
                            <div className="font-medium">
                              {b.fullName} — {b.phone}
                            </div>
                            {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {benTotalPages > 1 ? (
                <div className="flex max-w-xl flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                  <span className="text-muted-foreground">
                    {t('distributionNew.beneficiaryPagingSummary', {
                      page: benPage,
                      totalPages: benTotalPages,
                      total: benPayload?.total ?? 0,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={benPage <= 1}
                      onClick={() => setBenPage((p) => Math.max(1, p - 1))}
                    >
                      {t('distributionNew.beneficiaryPagingPrev')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={benPage >= benTotalPages}
                      onClick={() => setBenPage((p) => p + 1)}
                    >
                      {t('distributionNew.beneficiaryPagingNext')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {beneficiaryId ? (
            <div className="max-w-xl space-y-2 rounded-lg border border-border bg-muted/15 p-3">
              <div className="text-sm font-semibold">{t('distributionNew.suggestedAidTitle')}</div>
              <p className="text-xs text-muted-foreground">{t('distributionNew.suggestedAidDesc')}</p>
              {needsLoading ? (
                <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
              ) : needRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('distributionNew.noRecordedNeedsBeneficiary')}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-card text-sm">
                  <table className="w-full min-w-[320px] table-fixed border-separate border-spacing-0">
                    <colgroup>
                      <col className="w-[28%]" />
                      <col className="w-[28%]" />
                      <col className="w-[14%]" />
                      <col className="w-[30%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="border-e border-border px-2 py-2 text-start text-xs font-medium">
                          {t('distributionNew.needCategoryCol')}
                        </th>
                        <th className="border-e border-border px-2 py-2 text-start text-xs font-medium">
                          {t('distributionNew.needItemCol')}
                        </th>
                        <th className="border-e border-border px-2 py-2 text-start text-xs font-medium">
                          {t('distributionNew.needQtyCol')}
                        </th>
                        <th className="px-2 py-2 text-start text-xs font-medium">{t('distributionNew.needNotesCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {needRows.map((row, idx) => (
                        <tr key={`${row.aidCategoryId}-${row.itemId ?? 'c'}-${idx}`} className="border-b border-border/70 last:border-0">
                          <td className="border-e border-border px-2 py-2 align-middle break-words">{row.aidCategoryName}</td>
                          <td className="border-e border-border px-2 py-2 align-middle break-words text-muted-foreground">
                            {row.itemName ?? t('distributionNew.categoryLevelNeed')}
                          </td>
                          <td className="border-e border-border px-2 py-2 align-middle tabular-nums">{row.quantity}</td>
                          <td className="px-2 py-2 align-middle break-words text-muted-foreground">
                            {row.notes?.trim() ? row.notes : t('common.dash')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate('/app/distributions')}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!beneficiaryId} onClick={() => setStep(2)}>
              {t('common.next')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t('distributionNew.step2')}</CardTitle>
          <CardDescription>{t('distributionNew.step2Desc')}</CardDescription>
          {beneficiaryId && needsLoading ? (
            <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
          ) : beneficiaryId && suggestedCategoryLabels.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t('distributionNew.suggestedCategoriesHint')}:</span>{' '}
              {suggestedCategoryLabels.join(', ')}
            </p>
          ) : beneficiaryId && !needsLoading && needRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('distributionNew.noRecordedNeedsBeneficiary')}</p>
          ) : null}
          {stockLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : stockOptions.length === 0 ? (
            <div className="text-sm text-amber-700">{t('distributionNew.noStock')}</div>
          ) : null}
          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t('common.back')}
            </Button>
            <Button type="button" onClick={() => setStep(3)} disabled={stockOptions.length === 0}>
              {t('common.next')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-4 p-4">
          <CardTitle>{t('distributionNew.step3')}</CardTitle>
          <CardDescription>{t('distributionNew.step3Desc')}</CardDescription>

          {needsLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-sm font-semibold">{t('distributionNew.suggestedAidTitle')}</div>
                <p className="text-xs text-muted-foreground">{t('distributionNew.suggestedAidDesc')}</p>
                {needRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('distributionNew.noRecordedNeedsBeneficiary')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border bg-card">
                    <table className="w-full min-w-[320px] table-fixed border-separate border-spacing-0 text-sm">
                      <colgroup>
                        <col className="w-[28%]" />
                        <col className="w-[28%]" />
                        <col className="w-[14%]" />
                        <col className="w-[30%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th
                            scope="col"
                            className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground"
                          >
                            {t('distributionNew.needCategoryCol')}
                          </th>
                          <th
                            scope="col"
                            className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground"
                          >
                            {t('distributionNew.needItemCol')}
                          </th>
                          <th
                            scope="col"
                            className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground"
                          >
                            {t('distributionNew.needQtyCol')}
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-start font-medium text-foreground">
                            {t('distributionNew.needNotesCol')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {needRows.map((row, idx) => (
                          <tr key={`${row.aidCategoryId}-${row.itemId ?? 'c'}-${idx}`} className="border-b border-border/70 last:border-0">
                            <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words">
                              {row.aidCategoryName}
                            </td>
                            <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words text-muted-foreground">
                              {row.itemName ?? t('distributionNew.categoryLevelNeed')}
                            </td>
                            <td className="border-e border-border px-3 py-2.5 align-middle text-start tabular-nums">
                              {row.quantity}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-start break-words text-muted-foreground">
                              {row.notes?.trim() ? row.notes : t('common.dash')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('distributionNew.notes')}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t('distributionNew.allocationTitle')}</div>
                    <p className="text-xs text-muted-foreground">{t('distributionNew.allocationDesc')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {suggestedCategoryIds.size > 0 ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={filterSuggestedOnly}
                          onChange={(e) => setFilterSuggestedOnly(e.target.checked)}
                          className="h-4 w-4 shrink-0 rounded border border-input accent-primary"
                        />
                        <span>{t('distributionNew.filterSuggestedStock')}</span>
                      </label>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 text-xs"
                      onClick={() => applySuggestedItems()}
                      disabled={!needRows.length || stockOptions.length === 0}
                    >
                      {t('distributionNew.useSuggestedItems')}
                    </Button>
                  </div>
                </div>
                {filterSuggestedOnly && stockOptionsForSelect.length === 0 && stockOptions.length > 0 ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200">{t('distributionNew.filterSuggestedNoMatches')}</p>
                ) : null}
                {lines.map((line, i) => {
                  const sel = stockOptions.find((o) => o.id === line.stockItemId);
                  return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label>{t('stock.colItem')}</Label>
                        {sel?.suggested ? (
                          <Badge variant="success" className="font-normal">
                            {t('distributionNew.suggestedBadge')}
                          </Badge>
                        ) : null}
                      </div>
                      <select
                        className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                        value={line.stockItemId}
                        onChange={(e) => updateLine(i, { stockItemId: e.target.value })}
                      >
                        <option value="">{t('common.dash')}</option>
                        {stockOptionsForSelect.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full space-y-1 sm:w-32">
                      <Label>{t('distributionNew.qty')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value, 10) || 1 })}
                      />
                    </div>
                    <Button type="button" variant="outline" className="h-10" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                      {t('common.delete')}
                    </Button>
                  </div>
                  );
                })}
                <Button type="button" variant="outline" onClick={addLine}>
                  {t('distributionNew.addLine')}
                </Button>
              </div>

              {selectedAidCategoryIds.length > 0 && recentAidFetching ? (
                <p className="text-xs text-muted-foreground">{t('distributionNew.recentAidChecking')}</p>
              ) : null}

              {recentWarnings.length > 0 ? (
                <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 dark:bg-amber-950/30">
                  <div className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                    {t('distributionNew.recentAidTitle')}
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-100/90">
                    {t('distributionNew.recentAidSubtitle', { days: recentAid?.days ?? 7 })}
                  </p>
                  <ul className="space-y-3 text-sm">
                    {recentWarnings.map((cat) => {
                      const locale = i18n.language.startsWith('ar') ? ar : enUS;
                      let when = '';
                      try {
                        when = formatDistanceToNow(new Date(cat.lastDeliveredAt), {
                          addSuffix: true,
                          locale,
                        });
                      } catch {
                        when = cat.lastDeliveredAt;
                      }
                      return (
                        <li
                          key={cat.aidCategoryId}
                          className="rounded-md border border-amber-500/25 bg-background/80 px-3 py-2 dark:bg-background/40"
                        >
                          <div className="font-medium text-foreground">
                            {t('distributionNew.recentAidSummary', {
                              category: cat.aidCategoryName || t('common.dash'),
                              when,
                            })}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('distributionNew.recentAidLastDelivery')}:{' '}
                            {new Date(cat.lastDeliveredAt).toLocaleString(
                              i18n.language.startsWith('ar') ? 'ar' : undefined,
                            )}
                          </div>
                          {cat.deliveredItems.length > 0 ? (
                            <div className="mt-2">
                              <div className="text-xs font-medium text-muted-foreground">
                                {t('distributionNew.recentAidItemsHeading')}
                              </div>
                              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                                {cat.deliveredItems.map((it, idx) => (
                                  <li key={`${cat.aidCategoryId}-${it.aidCategoryItemId ?? idx}`}>
                                    {it.itemName || t('common.dash')} × {it.quantityDelivered}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={recentAidAck}
                      onChange={(e) => setRecentAidAck(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
                    />
                    <span>{t('distributionNew.recentAidAck')}</span>
                  </label>
                </div>
              ) : null}
            </>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
            <Button
              type="button"
              disabled={
                saving ||
                (selectedAidCategoryIds.length > 0 && recentAidFetching) ||
                (recentWarnings.length > 0 && !recentAidAck)
              }
              onClick={() => void submit()}
            >
              {saving ? t('common.saving') : t('distributionNew.submit')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
