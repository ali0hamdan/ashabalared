import { BeneficiaryDuplicateWarnings } from '@/components/BeneficiaryDuplicateWarnings';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BeneficiaryItemNeedsFields } from '@/components/BeneficiaryItemNeedsFields';
import {
  buildCategoryNeedsPayload,
  buildItemNeedsPayload,
  normalizeAidCategoriesForForm,
  sanitizeDigitsOnly,
  validateCategoryQtyInCheckedCategories,
  validateItemQtyInCheckedCategories,
  type ItemFieldRowState,
} from '@/lib/beneficiaryItemNeeds';
import { applyFoodRationsCookingGate } from '@/lib/foodRationsCategory';
import { BENEFICIARY_AREA_VALUES, isAllowedBeneficiaryArea } from '@/lib/beneficiaryAreas';
import { isOptionalLebaneseLocalPhoneValid, sanitizeLebaneseLocalPhoneInput } from '@/lib/lebanesePhone';
import { BENEFICIARY_LIFECYCLE, type BeneficiaryLifecycle } from '@/lib/beneficiaryLifecycleStatus';
import { useBeneficiaryDuplicateCheck } from '@/hooks/useBeneficiaryDuplicateCheck';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
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
  const [street, setStreet] = useState('');
  const [householdSize, setHouseholdSize] = useState('1');
  const [canCook, setCanCook] = useState(false);
  const [recordStatus, setRecordStatus] = useState<BeneficiaryLifecycle>(BENEFICIARY_LIFECYCLE.ACTIVE);
  const [needsBundle, setNeedsBundle] = useState<{
    categoryChecked: Record<string, boolean>;
    categoryQtyFields: Record<string, string>;
    itemFields: Record<string, ItemFieldRowState>;
  }>({ categoryChecked: {}, categoryQtyFields: {}, itemFields: {} });
  const [saving, setSaving] = useState(false);
  const [phoneDuplicateAck, setPhoneDuplicateAck] = useState(false);

  const duplicateFields = useMemo(
    () => ({ fullName, phone, area, street }),
    [fullName, phone, area, street],
  );
  const duplicateCheck = useBeneficiaryDuplicateCheck(duplicateFields, undefined);

  const catRows = useMemo(() => normalizeAidCategoriesForForm(categories), [categories]);

  useEffect(() => {
    setPhoneDuplicateAck(false);
  }, [phone]);

  useEffect(() => {
    setNeedsBundle((prev) => {
      const categoryChecked = { ...prev.categoryChecked };
      const categoryQtyFields = { ...prev.categoryQtyFields };
      const itemFields = { ...prev.itemFields };
      for (const c of catRows) {
        if (!(c.id in categoryChecked)) categoryChecked[c.id] = false;
        if (!(c.id in categoryQtyFields)) categoryQtyFields[c.id] = '';
        for (const it of c.items) {
          if (!(it.id in itemFields)) itemFields[it.id] = { notes: '', qty: '' };
        }
      }
      return { categoryChecked, categoryQtyFields, itemFields };
    });
  }, [catRows]);

  useEffect(() => {
    if (!canCook) {
      setNeedsBundle((prev) => applyFoodRationsCookingGate(false, catRows, prev));
    }
  }, [catRows, canCook]);

  function handleCanCookChange(v: boolean) {
    setCanCook(v);
    if (!v) {
      setNeedsBundle((prev) => applyFoodRationsCookingGate(false, catRows, prev));
    }
  }

  const setCategoryChecked = useCallback(
    (u: SetStateAction<Record<string, boolean>>) => {
      setNeedsBundle((s) => ({
        ...s,
        categoryChecked: typeof u === 'function' ? u(s.categoryChecked) : u,
      }));
    },
    [],
  );

  const setItemFields = useCallback(
    (u: SetStateAction<Record<string, ItemFieldRowState>>) => {
      setNeedsBundle((s) => ({
        ...s,
        itemFields: typeof u === 'function' ? u(s.itemFields) : u,
      }));
    },
    [],
  );

  const setCategoryQtyFields = useCallback(
    (u: SetStateAction<Record<string, string>>) => {
      setNeedsBundle((s) => ({
        ...s,
        categoryQtyFields: typeof u === 'function' ? u(s.categoryQtyFields) : u,
      }));
    },
    [],
  );

  const hasAnyCatalogItems = useMemo(() => catRows.some((c) => c.items.length > 0), [catRows]);

  function validate(): boolean {
    if (!fullName.trim()) {
      toast.error(t('beneficiaryNew.validationFullName'));
      return false;
    }
    if (!isOptionalLebaneseLocalPhoneValid(phone)) {
      toast.error(t('beneficiaryNew.validationPhoneFormat'));
      return false;
    }
    if (!area.trim() || !isAllowedBeneficiaryArea(area)) {
      toast.error(t('beneficiaryNew.validationAreaInvalid'));
      return false;
    }
    const n = parseInt(householdSize, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t('beneficiaryNew.validationHousehold'));
      return false;
    }
    const qtyCheck = validateItemQtyInCheckedCategories(catRows, needsBundle.categoryChecked, needsBundle.itemFields);
    if (qtyCheck.ok === false) {
      toast.error(t('beneficiaryNew.validationItemNeedQty', { name: qtyCheck.itemName, category: qtyCheck.categoryName }));
      return false;
    }
    const catQtyCheck = validateCategoryQtyInCheckedCategories(
      catRows,
      needsBundle.categoryChecked,
      needsBundle.categoryQtyFields,
    );
    if (catQtyCheck.ok === false) {
      toast.error(t('beneficiaryNew.validationCategoryQty', { name: catQtyCheck.categoryName }));
      return false;
    }
    if (duplicateCheck.data?.hasExactPhoneDuplicate && !phoneDuplicateAck) {
      toast.error(t('beneficiaryDuplicate.mustAcknowledgePhone'));
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validate()) return;
    const familyCount = parseInt(householdSize, 10);
    const gated = applyFoodRationsCookingGate(canCook, catRows, needsBundle);
    const itemNeeds = buildItemNeedsPayload(catRows, gated.categoryChecked, gated.itemFields);
    const categoryNeeds = buildCategoryNeedsPayload(
      catRows,
      gated.categoryChecked,
      gated.categoryQtyFields,
    );

    const phoneTrim = phone.trim();
    const payload: Record<string, unknown> = {
      fullName: fullName.trim(),
      area: area.trim(),
      familyCount,
      regionId: null,
      district: null,
      cookingStove: canCook,
      categoryNeeds,
      status: recordStatus,
    };
    const streetTrim = street.trim();
    if (streetTrim) {
      payload.street = streetTrim;
    }
    if (phoneTrim.length === 8) {
      payload.phone = phoneTrim;
    }
    if (itemNeeds.length) {
      payload.itemNeeds = itemNeeds;
    }

    setSaving(true);
    try {
      const { data } = await api.post('/beneficiaries', payload);
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['aid-category-beneficiaries'] });
      toast.success(t('beneficiaryNew.createSuccess'));
      navigate(`/app/beneficiaries/${data.id}`);
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t('beneficiaryNew.title')} description={t('beneficiaryNew.subtitle')} />

      <Card className="space-y-5 p-5 sm:p-7">
        <CardTitle>{t('beneficiaryNew.sectionData')}</CardTitle>
        <CardDescription>{t('beneficiaryNew.sectionDataDesc')}</CardDescription>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('beneficiaryNew.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>{t('beneficiaryNew.phone')}</Label>
              <p className="text-xs text-muted-foreground">{t('beneficiaryNew.phoneOptionalHint')}</p>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={8}
                className="w-full tabular-nums"
                placeholder="12345678"
                value={phone}
                onChange={(e) => setPhone(sanitizeLebaneseLocalPhoneInput(e.target.value))}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label>{t('beneficiaryNew.householdSize')}</Label>
              <p className="text-xs text-muted-foreground invisible select-none" aria-hidden="true">
                {t('beneficiaryNew.phoneOptionalHint')}
              </p>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="w-full tabular-nums"
                value={householdSize}
                onChange={(e) => setHouseholdSize(sanitizeDigitsOnly(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('beneficiaryNew.recordStatus')}</Label>
            <p className="text-xs text-muted-foreground">{t('beneficiaryNew.recordStatusHint')}</p>
            <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-muted/35 p-1.5">
              <Button
                type="button"
                variant={recordStatus === BENEFICIARY_LIFECYCLE.ACTIVE ? 'primary' : 'outline'}
                className="h-9 flex-1 sm:flex-initial sm:min-w-[7rem]"
                onClick={() => setRecordStatus(BENEFICIARY_LIFECYCLE.ACTIVE)}
              >
                {t('beneficiaryNew.statusActive')}
              </Button>
              <Button
                type="button"
                variant={recordStatus === BENEFICIARY_LIFECYCLE.INACTIVE ? 'primary' : 'outline'}
                className="h-9 flex-1 sm:flex-initial sm:min-w-[7rem]"
                onClick={() => setRecordStatus(BENEFICIARY_LIFECYCLE.INACTIVE)}
              >
                {t('beneficiaryNew.statusInactive')}
              </Button>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('beneficiaryNew.area')}</Label>
            <select
              required
              className="form-select"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="">{t('beneficiaryNew.areaPlaceholder')}</option>
              {BENEFICIARY_AREA_VALUES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('beneficiaryNew.street')}</Label>
            <p className="text-xs text-muted-foreground">{t('beneficiaryNew.streetHint')}</p>
            <Input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              autoComplete="street-address"
              placeholder={t('beneficiaryNew.streetPlaceholder')}
            />
          </div>
          <BeneficiaryDuplicateWarnings
            result={duplicateCheck.data}
            isLoading={duplicateCheck.isLoading}
            isFetching={duplicateCheck.isFetching}
            phoneDuplicateAcknowledged={phoneDuplicateAck}
            onPhoneDuplicateAcknowledgedChange={setPhoneDuplicateAck}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5 sm:p-7">
        <CardTitle>{t('beneficiaryNew.needsTitle')}</CardTitle>
        <CardDescription>{t('beneficiaryNew.needsDescItems')}</CardDescription>
        <BeneficiaryItemNeedsFields
          t={t}
          catLoading={catLoading}
          catRows={catRows}
          hasAnyCatalogItems={hasAnyCatalogItems}
          canCook={canCook}
          onCanCookChange={handleCanCookChange}
          categoryChecked={needsBundle.categoryChecked}
          setCategoryChecked={setCategoryChecked}
          categoryQtyFields={needsBundle.categoryQtyFields}
          setCategoryQtyFields={setCategoryQtyFields}
          itemFields={needsBundle.itemFields}
          setItemFields={setItemFields}
        />
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" type="button" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <Button
          type="button"
          disabled={
            saving || Boolean(duplicateCheck.data?.hasExactPhoneDuplicate && !phoneDuplicateAck)
          }
          onClick={() => void submit()}
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
