import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { BeneficiaryStatusBadge, DistributionStatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function BeneficiaryDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.roleCode);
  const canEdit = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['beneficiary', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get(`/beneficiaries/${id}`)).data,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'beneficiary-edit', id],
    enabled: Boolean(id) && canEdit,
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [householdSize, setHouseholdSize] = useState('1');
  const [canCook, setCanCook] = useState(false);
  const [categoryQty, setCategoryQty] = useState<Record<string, string>>({});
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});

  const catRows = useMemo(() => (Array.isArray(categories) ? categories.filter((c: { isActive?: boolean }) => c.isActive) : []), [categories]);

  useEffect(() => {
    if (!editing || !data || categories === undefined) return;
    const rows = Array.isArray(categories) ? categories.filter((c: { isActive?: boolean }) => c.isActive) : [];
    setFullName(data.fullName ?? '');
    setPhone(data.phone ?? '');
    setArea(data.area ?? '');
    setHouseholdSize(String(data.familyCount ?? 1));
    setCanCook(Boolean(data.cookingStove));
    const next: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    for (const c of rows) {
      const row = (data.categories ?? []).find((x: { categoryId?: string }) => x.categoryId === c.id);
      if (row && typeof (row as { quantity?: number }).quantity === 'number') {
        next[c.id] = String((row as { quantity: number }).quantity);
      } else if (row) {
        next[c.id] = '1';
      } else {
        next[c.id] = '';
      }
      const rawNote = row ? (row as { notes?: string | null }).notes : null;
      nextNotes[c.id] = typeof rawNote === 'string' ? rawNote : '';
    }
    setCategoryQty(next);
    setCategoryNotes(nextNotes);
  }, [editing, data, categories]);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.patch(`/beneficiaries/${id}`, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['beneficiary', id] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      setEditing(false);
      toast.success(t('beneficiaryDetail.updateSuccess'));
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
    },
  });

  const dateLocale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';

  if (!id) return null;
  if (isError) return <div className="text-sm text-muted-foreground">{t('common.saveError')}</div>;
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const deliveredCount = (data.distributions ?? []).filter((d: { status: string }) => d.status === 'DELIVERED').length;

  function validateEdit(): boolean {
    if (!fullName.trim()) {
      toast.error(t('beneficiaryNew.validationFullName'));
      return false;
    }
    if (!phone.trim()) {
      toast.error(t('beneficiaryNew.validationPhone'));
      return false;
    }
    if (!area.trim()) {
      toast.error(t('beneficiaryNew.validationArea'));
      return false;
    }
    const n = parseInt(householdSize, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t('beneficiaryNew.validationHousehold'));
      return false;
    }
    return true;
  }

  function saveEdit() {
    if (!validateEdit()) return;
    const familyCount = parseInt(householdSize, 10);
    const categoryNeeds: { categoryId: string; quantity: number; notes?: string }[] = [];
    for (const c of catRows) {
      const raw = (categoryQty[c.id] ?? '').trim();
      if (raw === '') continue;
      const q = parseInt(raw, 10);
      if (!Number.isFinite(q) || q < 1) {
        toast.error(t('beneficiaryNew.validationCategoryQty', { name: c.name }));
        return;
      }
      const note = (categoryNotes[c.id] ?? '').trim();
      categoryNeeds.push({ categoryId: c.id, quantity: q, ...(note ? { notes: note } : {}) });
    }
    updateMutation.mutate({
      fullName: fullName.trim(),
      phone: phone.trim(),
      area: area.trim(),
      familyCount,
      regionId: null,
      district: null,
      cookingStove: canCook,
      categoryNeeds,
    });
  }

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-col gap-3 print:hidden md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.fullName}</h1>
          <p className="text-sm text-muted-foreground">{t('beneficiaryDetail.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button type="button" variant="outline" onClick={() => (editing ? setEditing(false) : setEditing(true))}>
              {editing ? t('common.cancel') : t('common.edit')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => window.print()}>
            {t('beneficiaryDetail.print')}
          </Button>
        </div>
      </div>

      {editing ? (
        <Card className="space-y-4 p-4 sm:p-6">
          <CardTitle>{t('beneficiaryDetail.editTitle')}</CardTitle>
          <CardDescription>{t('beneficiaryDetail.editDesc')}</CardDescription>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('beneficiaryNew.fullName')}</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('beneficiaryNew.phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('beneficiaryNew.area')}</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('beneficiaryNew.householdSize')}</Label>
              <Input type="number" min={1} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} />
            </div>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <div className="font-medium">{t('beneficiaryNew.needsTitle')}</div>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <input
                  id="beneficiary-edit-can-cook"
                  type="checkbox"
                  checked={canCook}
                  onChange={(e) => setCanCook(e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border border-input accent-primary"
                />
                <Label htmlFor="beneficiary-edit-can-cook" className="cursor-pointer text-sm font-medium leading-none">
                  {t('beneficiaryNew.canCook')}
                </Label>
              </li>
              {catRows.map((c: { id: string; name: string }) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-start sm:gap-3"
                >
                  <span className="min-w-0 shrink-0 text-sm font-medium sm:w-36 sm:pt-2">{c.name}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground sm:sr-only">{t('beneficiaryNew.categoryNotesLabel')}</Label>
                      <Input
                        className="h-10"
                        maxLength={500}
                        placeholder={t('beneficiaryNew.categoryNotesPlaceholder')}
                        value={categoryNotes[c.id] ?? ''}
                        onChange={(e) => setCategoryNotes((m) => ({ ...m, [c.id]: e.target.value }))}
                      />
                    </div>
                    <div className="w-full shrink-0 space-y-1 sm:w-28">
                      <Label className="text-xs text-muted-foreground sm:sr-only">{t('beneficiaryNew.qtyLabel')}</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-10"
                        placeholder="0"
                        value={categoryQty[c.id] ?? ''}
                        onChange={(e) => setCategoryQty((m) => ({ ...m, [c.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={updateMutation.isPending} onClick={() => saveEdit()}>
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>{t('beneficiaryDetail.basicTitle')}</CardTitle>
            <CardDescription className="mt-2">{t('beneficiaryDetail.basicDescShort')}</CardDescription>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryDetail.phone')}</dt>
                <dd className="font-medium">{data.phone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.area')}</dt>
                <dd className="font-medium">{data.area?.trim() ? data.area : t('common.dash')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.householdSize')}</dt>
                <dd className="font-medium">{data.familyCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryNew.canCook')}</dt>
                <dd className="font-medium">{data.cookingStove ? t('common.yes') : t('common.no')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('beneficiaryDetail.status')}</dt>
                <dd className="font-medium">
                  <BeneficiaryStatusBadge status={data.status} />
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle>{t('beneficiaryDetail.needsTitle')}</CardTitle>
            <CardDescription className="mt-2">{t('beneficiaryDetail.needsDesc')}</CardDescription>
            <ul className="mt-3 space-y-2 text-sm">
              {(data.categories ?? []).map(
                (n: { id: string; quantity?: number; notes?: string | null; category?: { name?: string } }) => (
                  <li key={n.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <div>
                      <span className="font-medium">{n.category?.name}</span>
                      <span className="ms-2 text-muted-foreground">
                        × {typeof n.quantity === 'number' ? n.quantity : 1}
                      </span>
                    </div>
                    {n.notes?.trim() ? (
                      <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{n.notes.trim()}</p>
                    ) : null}
                  </li>
                ),
              )}
              {(data.categories ?? []).length === 0 ? <li className="text-muted-foreground">{t('common.none')}</li> : null}
            </ul>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="text-muted-foreground">{t('beneficiaryDetail.deliveredCountLabel')}</div>
              <div className="text-2xl font-bold">{deliveredCount}</div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardTitle>{t('beneficiaryDetail.distTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('beneficiaryDetail.distDesc')}</CardDescription>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-start">
              <tr className="border-b border-border">
                <th className="p-2">{t('beneficiaryDetail.colStatus')}</th>
                <th className="p-2">{t('beneficiaryDetail.colDate')}</th>
                <th className="p-2">{t('beneficiaryDetail.colPrepared')}</th>
                <th className="p-2">{t('beneficiaryDetail.colDeliveredAt')}</th>
                <th className="p-2">{t('beneficiaryDetail.colItems')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.distributions ?? []).map((d: any) => (
                <tr key={d.id} className="border-b border-border align-top">
                  <td className="p-2">
                    <DistributionStatusBadge status={d.status} />
                  </td>
                  <td className="p-2 whitespace-nowrap">{new Date(d.createdAt).toLocaleString(dateLocale)}</td>
                  <td className="p-2">{d.createdBy?.displayName}</td>
                  <td className="p-2 whitespace-nowrap">
                    {d.deliveredAt ? new Date(d.deliveredAt).toLocaleString(dateLocale) : t('common.dash')}
                  </td>
                  <td className="p-2">
                    <ul className="space-y-1">
                      {(d.items ?? []).map((it: any) => {
                        const name = it.stockItem?.aidCategoryItem?.name ?? it.aidCategory?.name ?? '';
                        const qty = it.quantityPlanned ?? 0;
                        const delivered = it.quantityDelivered ?? 0;
                        return (
                          <li key={it.id}>
                            {qty} × {name}{' '}
                            <span className="text-muted-foreground">
                              ({t('distributions.deliveredQty')}: {delivered})
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('beneficiaryDetail.timelineTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('beneficiaryDetail.timelineDesc')}</CardDescription>
        <ol className="mt-4 space-y-3 border-s-2 border-border ps-4">
          {(data.timelineEvents ?? []).map((ev: any) => (
            <li key={ev.id} className="relative">
              <div className="absolute -start-[21px] top-1 h-3 w-3 rounded-full bg-primary" />
              <div className="text-sm font-medium">{ev.titleAr}</div>
              <div className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString(dateLocale)}</div>
              {ev.detail ? <div className="mt-1 text-sm whitespace-pre-wrap">{ev.detail}</div> : null}
            </li>
          ))}
          {(data.timelineEvents ?? []).length === 0 ? <li className="text-sm text-muted-foreground">{t('common.none')}</li> : null}
        </ol>
      </Card>
    </div>
  );
}
