import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { parseDeleteBlockedBody, type DeleteBlockedPayload } from '@/lib/deleteBlocked';

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

export function CategoriesPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/aid-categories', { params: { includeInactive: 'true' } })).data,
  });
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const [catDlg, setCatDlg] = useState<'add' | { edit: any } | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catActive, setCatActive] = useState(true);

  const [itemDlg, setItemDlg] = useState<{ categoryId: string; mode: 'add' | { edit: any } } | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDefQty, setItemDefQty] = useState(1);
  const [itemUnit, setItemUnit] = useState<string>('PIECE');

  const [delCat, setDelCat] = useState<any | null>(null);
  const [delCatLoading, setDelCatLoading] = useState(false);
  const [delItem, setDelItem] = useState<any | null>(null);

  const saveCategory = useMutation({
    mutationFn: async () => {
      if (catDlg === 'add') {
        await api.post('/aid-categories', { name: catName, description: catDesc || undefined, isActive: catActive });
      } else if (catDlg && typeof catDlg === 'object' && 'edit' in catDlg) {
        await api.patch(`/aid-categories/${catDlg.edit.id}`, {
          name: catName || undefined,
          description: catDesc,
          isActive: catActive,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t('categories.saveOk'));
      setCatDlg(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
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
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => api.delete(`/aid-categories/items/${id}`),
    onSuccess: async () => {
      toast.success(t('categories.itemDeleteOk'));
      setDelItem(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
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

  function openEditCategory(c: any) {
    setCatName(c.name);
    setCatDesc(c.description ?? '');
    setCatActive(Boolean(c.isActive));
    setCatDlg({ edit: c });
  }

  async function confirmDeleteCategory() {
    if (!delCat) return;
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
      await qc.invalidateQueries({ queryKey: ['categories'] });
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

  function openEditItem(categoryId: string, it: any) {
    setItemDlg({ categoryId, mode: { edit: it } });
    setItemName(it.name);
    setItemDefQty(it.defaultQuantity ?? 1);
    setItemUnit(it.unit ?? 'PIECE');
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const canEdit = role === 'SUPER_ADMIN' || role === 'ADMIN';

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

      <div className="space-y-3">
        {rows.map((c: any) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  {c.isActive ? <Badge variant="success">{t('categories.active')}</Badge> : <Badge variant="danger">{t('categories.inactive')}</Badge>}
                  {c.archivedAt ? (
                    <Badge variant="outline" className="border-amber-600 text-amber-800 dark:text-amber-200">
                      {t('categories.archivedBadge')}
                    </Badge>
                  ) : null}
                </div>
                {c.description ? <CardDescription className="mt-1">{c.description}</CardDescription> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <>
                    <Button variant="outline" type="button" className="h-9 text-xs" onClick={() => openEditCategory(c)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="outline" type="button" className="h-9 text-xs" onClick={() => setDelCat(c)}>
                      {t('common.delete')}
                    </Button>
                    <Button variant="outline" type="button" className="h-9 text-xs" onClick={() => openAddItem(c.id)}>
                      {t('categories.addItem')}
                    </Button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => setOpen((m) => ({ ...m, [c.id]: !m[c.id] }))}
                >
                  {open[c.id] ? t('categories.toggleHide') : t('categories.toggleShow')}
                </button>
              </div>
            </div>
            {open[c.id] ? (
              <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                {(c.items ?? []).map((it: any) => (
                  <li key={it.id} className="flex flex-col gap-2 rounded-lg bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">{it.name}</span>
                      <span className="ms-2 text-muted-foreground">
                        {t('categories.defaultQty')}: {it.defaultQuantity} · {it.unit}
                      </span>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <Button variant="outline" type="button" className="h-8 px-2 text-xs" onClick={() => openEditItem(c.id, it)}>
                          {t('common.edit')}
                        </Button>
                        <Button variant="outline" type="button" className="h-8 px-2 text-xs" onClick={() => setDelItem(it)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
                {(c.items ?? []).length === 0 ? <li className="text-muted-foreground">{t('categories.noItems')}</li> : null}
              </ul>
            ) : null}
          </Card>
        ))}
        {rows.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">{t('categories.empty')}</Card> : null}
      </div>

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
