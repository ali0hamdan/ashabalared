import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { parseDeleteBlocked, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';
import type { AidCategoryOption, StockItemNested } from '@/types/api-shapes';

type StockTableRow = StockItemNested;

function axiosMessage(e: unknown): string | undefined {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === 'string' ? m : undefined;
}

export function StockPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const [lowOnly, setLowOnly] = useState(false);
  const [hasAvailable, setHasAvailable] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<AidCategoryOption[]>('/aid-categories')).data,
  });
  const catOpts = useMemo((): AidCategoryOption[] => (Array.isArray(categories) ? categories : []), [categories]);

  const { data, isLoading } = useQuery({
    queryKey: ['stock', lowOnly, hasAvailable, categoryId, q],
    queryFn: async () =>
      (
        await api.get<StockTableRow[]>('/stock', {
          params: {
            lowOnly: lowOnly ? 'true' : undefined,
            hasAvailable: hasAvailable ? 'true' : undefined,
            categoryId: categoryId || undefined,
            q: q.trim() || undefined,
          },
        })
      ).data,
  });
  const rows = useMemo((): StockTableRow[] => (Array.isArray(data) ? data : []), [data]);

  const [dlg, setDlg] = useState<{ id: string; label: string } | null>(null);
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');

  const [editDlg, setEditDlg] = useState<StockTableRow | null>(null);
  const [onHand, setOnHand] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [supplier, setSupplier] = useState('');

  const [addDlg, setAddDlg] = useState(false);
  const [addItemId, setAddItemId] = useState('');
  const [addQty, setAddQty] = useState(0);
  const [addThreshold, setAddThreshold] = useState(10);

  const [delStock, setDelStock] = useState<StockTableRow | null>(null);
  const [forceStock, setForceStock] = useState<{ row: StockTableRow; blocked: DeleteBlockedPayload } | null>(null);
  const [forceConfirm, setForceConfirm] = useState('');
  const [forceReason, setForceReason] = useState('');
  const [forcePending, setForcePending] = useState(false);

  async function saveAdjust() {
    if (!dlg) return;
    try {
      await api.patch(`/stock/${dlg.id}/adjust`, { delta, note: note || undefined });
      toast.success(t('stock.updateSuccess'));
      setDlg(null);
      setDelta(0);
      setNote('');
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch {
      toast.error(t('common.updateError'));
    }
  }

  async function saveEdit() {
    if (!editDlg) return;
    try {
      await api.patch(`/stock/${editDlg.id}`, {
        quantityOnHand: onHand,
        quantityReserved: editDlg.quantityReserved ?? 0,
        lowStockThreshold: threshold,
        supplier: supplier || null,
      });
      toast.success(t('stock.updateSuccess'));
      setEditDlg(null);
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: unknown) {
      toast.error(axiosMessage(e) ?? t('common.updateError'));
    }
  }

  async function saveAdd() {
    if (!addItemId) return;
    try {
      await api.post('/stock', {
        aidCategoryItemId: addItemId,
        quantityOnHand: addQty,
        lowStockThreshold: addThreshold,
      });
      toast.success(t('stock.addSuccess'));
      setAddDlg(false);
      setAddItemId('');
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: unknown) {
      toast.error(axiosMessage(e) ?? t('common.createError'));
    }
  }

  async function confirmDelete() {
    if (!delStock) return;
    try {
      await api.delete(`/stock/${delStock.id}`);
      toast.success(t('stock.deleteSuccess'));
      setDelStock(null);
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: unknown) {
      const blocked = parseDeleteBlocked(e);
      if (blocked && role === 'SUPER_ADMIN') {
        setDelStock(null);
        setForceStock({ row: delStock, blocked });
        setForceConfirm('');
        setForceReason('');
        return;
      }
      if (blocked) {
        toast.error(blocked.message);
        setDelStock(null);
        return;
      }
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.updateError'));
    }
  }

  async function confirmForceStock() {
    if (!forceStock) return;
    if (forceConfirm.trim() !== 'DELETE') {
      toast.error(t('adminOverride.mustTypeDelete'));
      return;
    }
    setForcePending(true);
    try {
      const { data } = await api.post<{ outcome?: string }>(`/stock/${forceStock.row.id}/force-delete`, {
        confirmationText: forceConfirm.trim(),
        reason: forceReason.trim() || undefined,
      });
      toast.success(data?.outcome === 'archived' ? t('stock.forceOutcomeArchived') : t('stock.deleteSuccess'));
      setForceStock(null);
      setForceConfirm('');
      setForceReason('');
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.updateError'));
    } finally {
      setForcePending(false);
    }
  }

  const itemsMissingStock = useMemo(() => {
    const have = new Set<string>();
    for (const r of rows) {
      const id = r.aidCategoryItemId ?? r.aidCategoryItem?.id;
      if (typeof id === 'string' && id) have.add(id);
    }
    const out: { id: string; label: string }[] = [];
    for (const c of catOpts) {
      for (const it of c.items ?? []) {
        if (!have.has(it.id)) out.push({ id: it.id, label: `${c.name} — ${it.name}` });
      }
    }
    return out;
  }, [catOpts, rows]);

  function openEdit(s: StockTableRow) {
    setEditDlg(s);
    setOnHand(s.quantityOnHand ?? 0);
    setThreshold(s.lowStockThreshold ?? s.threshold ?? 0);
    setSupplier(s.supplier ?? '');
  }

  function itemLabel(s: StockTableRow | null | undefined) {
    return s?.aidCategoryItem?.name ?? '—';
  }

  function catLabel(s: StockTableRow | null | undefined) {
    return s?.aidCategoryItem?.aidCategory?.name ?? '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('stock.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('stock.subtitle')}</p>
        </div>
        {role !== 'DELIVERY' ? (
          <Button type="button" onClick={() => setAddDlg(true)}>
            {t('stock.addStock')}
          </Button>
        ) : null}
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>{t('stock.filterCategory')}</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t('distributions.filterAll')}</option>
              {catOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t('stock.filterName')}</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('stock.searchPlaceholder')} />
          </div>
          <label className="flex items-center gap-2 pt-0 text-sm sm:pt-7">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            {t('stock.lowOnly')}
          </label>
          <label className="flex items-center gap-2 pt-0 text-sm sm:pt-7">
            <input type="checkbox" checked={hasAvailable} onChange={(e) => setHasAvailable(e.target.checked)} />
            {t('stock.hasAvailable')}
          </label>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-start">
              <tr className="border-b border-border">
                <th className="p-3">{t('stock.colItem')}</th>
                <th className="p-3">{t('stock.colCategory')}</th>
                <th className="p-3">{t('stock.colAvailable')}</th>
                <th className="p-3">{t('stock.colDelivered')}</th>
                <th className="p-3">{t('stock.colThreshold')}</th>
                <th className="p-3">{t('stock.colAlert')}</th>
                {role !== 'DELIVERY' ? <th className="p-3">{t('stock.colAction')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-muted/20">
                  <td className="p-3 font-medium">{itemLabel(s)}</td>
                  <td className="p-3">{catLabel(s)}</td>
                  <td className="p-3">{s.availableQuantity}</td>
                  <td className="p-3">{s.deliveredQuantity ?? 0}</td>
                  <td className="p-3">{s.threshold}</td>
                  <td className="p-3">
                    {s.stockStatus === 'LOW' ? <Badge variant="danger">{t('stock.low')}</Badge> : <Badge variant="success">{t('stock.normal')}</Badge>}
                  </td>
                  {role !== 'DELIVERY' ? (
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                      <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => openEdit(s)}>
                        {t('common.edit')}
                      </Button>
                      <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setDlg({ id: s.id, label: itemLabel(s) })}>
                        {t('stock.adjustShort')}
                      </Button>
                      <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setDelStock(s)}>
                        {t('common.delete')}
                      </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog
        open={Boolean(dlg)}
        onClose={() => setDlg(null)}
        title={t('stock.adjustTitle')}
        description={dlg?.label}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDlg(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void saveAdjust()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('stock.labelDelta')}</Label>
            <Input type="number" value={delta} onChange={(e) => setDelta(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>{t('stock.labelNote')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(editDlg)}
        onClose={() => setEditDlg(null)}
        title={t('stock.editTitle')}
        description={editDlg ? itemLabel(editDlg) : ''}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setEditDlg(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void saveEdit()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('stock.colAvailable')}</Label>
            <Input type="number" min={0} value={onHand} onChange={(e) => setOnHand(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>{t('stock.colThreshold')}</Label>
            <Input type="number" min={0} value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('stock.supplier')}</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={addDlg}
        onClose={() => setAddDlg(false)}
        title={t('stock.addTitle')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setAddDlg(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!addItemId} onClick={() => void saveAdd()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('stock.pickItem')}</Label>
            <select className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm" value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
              <option value="">{t('common.dash')}</option>
              {itemsMissingStock.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('stock.initialQty')}</Label>
            <Input type="number" min={0} value={addQty} onChange={(e) => setAddQty(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>{t('stock.colThreshold')}</Label>
            <Input type="number" min={0} value={addThreshold} onChange={(e) => setAddThreshold(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(delStock)}
        onClose={() => setDelStock(null)}
        title={t('stock.deleteTitle')}
        description={delStock ? itemLabel(delStock) : ''}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDelStock(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void confirmDelete()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('stock.deleteConfirm')}</p>
      </Dialog>

      <Dialog
        open={Boolean(forceStock)}
        onClose={() => {
          setForceStock(null);
          setForceConfirm('');
          setForceReason('');
        }}
        title={t('adminOverride.forceTitleStock')}
        description={forceStock ? itemLabel(forceStock.row) : ''}
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setForceStock(null);
                setForceConfirm('');
                setForceReason('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={forcePending} onClick={() => void confirmForceStock()}>
              {forcePending ? t('common.saving') : t('adminOverride.forceDelete')}
            </Button>
          </>
        }
      >
        {forceStock ? (
          <AdminForceDeletePanel
            t={t}
            blocked={forceStock.blocked}
            confirmValue={forceConfirm}
            onConfirmChange={setForceConfirm}
            reason={forceReason}
            onReasonChange={setForceReason}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
