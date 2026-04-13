import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

type Line = { stockItemId: string; quantity: number };

export function DistributionNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ stockItemId: '', quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  const { data: beneficiaries, isLoading: benLoading } = useQuery({
    queryKey: ['beneficiaries', 'dist-new'],
    queryFn: async () => (await api.get('/beneficiaries')).data,
  });
  const benRows = useMemo(() => (Array.isArray(beneficiaries) ? beneficiaries : []), [beneficiaries]);

  const { data: stockRows, isLoading: stockLoading } = useQuery({
    queryKey: ['stock', 'dist-new'],
    enabled: step >= 2,
    queryFn: async () => (await api.get('/stock', { params: { hasAvailable: 'true' } })).data,
  });
  const stocks = useMemo(() => (Array.isArray(stockRows) ? stockRows : []), [stockRows]);

  const stockOptions = useMemo(
    () =>
      stocks.map((s: any) => ({
        id: s.id,
        label: `${s.aidCategoryItem?.aidCategory?.name ?? ''} — ${s.aidCategoryItem?.name ?? s.id} (${s.availableQuantity})`,
      })),
    [stocks],
  );

  const { data: beneficiaryDetail, isLoading: beneficiaryDetailLoading } = useQuery({
    queryKey: ['beneficiary', beneficiaryId, 'distribution-new'],
    enabled: Boolean(beneficiaryId) && step >= 3,
    queryFn: async () => (await api.get(`/beneficiaries/${beneficiaryId}`)).data,
  });

  const beneficiaryNeeds = useMemo(() => {
    const cats = beneficiaryDetail?.categories;
    if (!Array.isArray(cats)) return [];
    return cats.filter((bc: { quantity?: number }) => typeof bc.quantity === 'number' && bc.quantity >= 1);
  }, [beneficiaryDetail]);

  function prefillLinesFromNeeds() {
    if (!beneficiaryNeeds.length) {
      toast.warning(t('distributionNew.noNeedsRecorded'));
      return;
    }
    const newLines: Line[] = [];
    for (const bc of beneficiaryNeeds) {
      const catId = (bc as { categoryId?: string; category?: { id?: string } }).categoryId ?? (bc as { category?: { id?: string } }).category?.id;
      const qty = Math.max(1, (bc as { quantity: number }).quantity);
      const match = stocks.find(
        (s: any) =>
          catId &&
          (s.aidCategoryItem?.aidCategoryId === catId || s.aidCategoryItem?.aidCategory?.id === catId) &&
          (s.availableQuantity ?? 0) > 0,
      );
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
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
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
          {benLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <div className="space-y-2">
              <Label>{t('distributionNew.beneficiary')}</Label>
              <select
                className="h-10 w-full max-w-xl rounded-md border border-border bg-card px-3 text-sm"
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
              >
                <option value="">{t('common.dash')}</option>
                {benRows.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.fullName} — {b.phone}
                  </option>
                ))}
              </select>
            </div>
          )}
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

          {beneficiaryDetailLoading ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-sm font-semibold">{t('distributionNew.beneficiaryNeedsTitle')}</div>
                <p className="text-xs text-muted-foreground">{t('distributionNew.beneficiaryNeedsDesc')}</p>
                {beneficiaryNeeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('distributionNew.noNeedsRecorded')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border bg-card">
                    <table className="w-full min-w-[280px] table-fixed border-separate border-spacing-0 text-sm">
                      <colgroup>
                        <col className="w-[38%]" />
                        <col className="w-[24%]" />
                        <col className="w-[38%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                            {t('distributionNew.needCategoryCol')}
                          </th>
                          <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                            {t('distributionNew.needQtyCol')}
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-start font-medium text-foreground">
                            {t('distributionNew.needNotesCol')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {beneficiaryNeeds.map((bc: { id?: string; categoryId?: string; category?: { name?: string }; quantity?: number; notes?: string | null }) => (
                          <tr key={bc.id ?? bc.categoryId} className="border-b border-border/70 last:border-0">
                            <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words">
                              {bc.category?.name ?? t('common.dash')}
                            </td>
                            <td className="border-e border-border px-3 py-2.5 align-middle text-start tabular-nums">
                              {bc.quantity ?? t('common.dash')}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-start break-words text-muted-foreground">
                              {bc.notes?.trim() ? bc.notes : t('common.dash')}
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t('distributionNew.allocationTitle')}</div>
                    <p className="text-xs text-muted-foreground">{t('distributionNew.allocationDesc')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 text-xs"
                    onClick={() => prefillLinesFromNeeds()}
                    disabled={!beneficiaryNeeds.length || stockOptions.length === 0}
                  >
                    {t('distributionNew.prefillFromNeeds')}
                  </Button>
                </div>
                {lines.map((line, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label>{t('stock.colItem')}</Label>
                      <select
                        className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                        value={line.stockItemId}
                        onChange={(e) => updateLine(i, { stockItemId: e.target.value })}
                      >
                        <option value="">{t('common.dash')}</option>
                        {stockOptions.map((o) => (
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
                ))}
                <Button type="button" variant="outline" onClick={addLine}>
                  {t('distributionNew.addLine')}
                </Button>
              </div>
            </>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? t('common.saving') : t('distributionNew.submit')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
