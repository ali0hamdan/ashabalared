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

export function BeneficiaryNewPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['categories', 'beneficiary-new'],
    queryFn: async () => (await api.get('/aid-categories')).data,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [householdSize, setHouseholdSize] = useState('1');
  const [canCook, setCanCook] = useState(false);
  const [categoryQty, setCategoryQty] = useState<Record<string, string>>({});
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const catRows = useMemo(() => (Array.isArray(categories) ? categories.filter((c: { isActive?: boolean }) => c.isActive) : []), [categories]);

  function validate(): boolean {
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

  async function submit() {
    if (!validate()) return;
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
    setSaving(true);
    try {
      const { data } = await api.post('/beneficiaries', {
        fullName: fullName.trim(),
        phone: phone.trim(),
        area: area.trim(),
        familyCount,
        regionId: null,
        district: null,
        cookingStove: canCook,
        categoryNeeds,
      });
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      toast.success(t('beneficiaryNew.createSuccess'));
      navigate(`/app/beneficiaries/${data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t('common.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('beneficiaryNew.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('beneficiaryNew.subtitle')}</p>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <CardTitle>{t('beneficiaryNew.sectionData')}</CardTitle>
        <CardDescription>{t('beneficiaryNew.sectionDataDesc')}</CardDescription>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('beneficiaryNew.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label>{t('beneficiaryNew.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <Label>{t('beneficiaryNew.area')}</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('beneficiaryNew.householdSize')}</Label>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={householdSize}
              onChange={(e) => setHouseholdSize(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-6">
        <CardTitle>{t('beneficiaryNew.needsTitle')}</CardTitle>
        <CardDescription>{t('beneficiaryNew.needsDesc')}</CardDescription>
        {catLoading ? (
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <ul className="space-y-3">
            <li className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <input
                id="beneficiary-can-cook"
                type="checkbox"
                checked={canCook}
                onChange={(e) => setCanCook(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border border-input accent-primary"
              />
              <Label htmlFor="beneficiary-can-cook" className="cursor-pointer text-sm font-medium leading-none">
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
                      inputMode="numeric"
                      className="h-10"
                      placeholder="0"
                      value={categoryQty[c.id] ?? ''}
                      onChange={(e) => setCategoryQty((m) => ({ ...m, [c.id]: e.target.value }))}
                    />
                  </div>
                </div>
              </li>
            ))}
            {catRows.length === 0 ? <li className="text-sm text-muted-foreground">{t('categories.empty')}</li> : null}
          </ul>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" type="button" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <Button type="button" disabled={saving} onClick={() => void submit()}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
