import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DistributionStatusBadge } from '@/components/StatusBadge';
import { DeliveryByAreaSkeleton } from '@/components/table-skeletons';
import { api } from '@/lib/api';
import { parseDeleteBlocked, parseForceDeleteForbidden, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type {
  DistributionBeneficiaryBrief,
  DistributionByAreaResponse,
  DistributionLineItem,
  DistributionListRow,
  UserSelectOption,
} from '@/types/api-shapes';

function formatDistLine(it: DistributionLineItem, t: TFunction) {
  const name = it.stockItem?.aidCategoryItem?.name ?? it.aidCategory?.name ?? '';
  const qty = it.quantityPlanned ?? 0;
  const delivered = it.quantityDelivered ?? 0;
  return `${qty} × ${name} (${t('distributions.deliveredQty')}: ${delivered})`;
}

function trimMeaningfulText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return '';
  return s;
}

function beneficiaryAreaForDistribution(b: DistributionBeneficiaryBrief | null | undefined): string {
  const fromRegion = trimMeaningfulText(b?.region?.nameAr);
  if (fromRegion) return fromRegion;
  return trimMeaningfulText(b?.area);
}

function beneficiaryStreetForDistribution(b: DistributionBeneficiaryBrief | null | undefined): string {
  const line =
    b?.addressLine !== undefined && b?.addressLine !== null ? b.addressLine : b?.street;
  return trimMeaningfulText(line);
}

function DistributionBeneficiaryAddress({
  b,
  t,
  dash,
}: {
  b: DistributionBeneficiaryBrief | null | undefined;
  t: TFunction;
  dash: string;
}) {
  const area = beneficiaryAreaForDistribution(b);
  const street = beneficiaryStreetForDistribution(b);
  if (!area && !street) return <span>{dash}</span>;
  return (
    <div className="min-w-[10rem] max-w-[20rem] space-y-0.5">
      {area ? (
        <div className="text-sm leading-snug">
          <span className="text-muted-foreground">{t('beneficiaryNew.area')}: </span>
          <span className="font-semibold text-foreground">{area}</span>
        </div>
      ) : null}
      {street ? (
        <div
          className={
            area ? 'text-xs leading-snug whitespace-pre-wrap' : 'text-sm leading-snug whitespace-pre-wrap'
          }
        >
          <span className="text-muted-foreground">{t('distributions.addressDetailLabel')}: </span>
          <span className={area ? 'text-sm font-semibold text-foreground' : 'font-semibold text-foreground'}>
            {street}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function personDisplayName(
  u: { displayName?: string | null; username?: string | null } | null | undefined,
  emptyLabel: string,
) {
  if (!u) return emptyLabel;
  const d = (u.displayName ?? '').trim();
  if (d) return d;
  const un = (u.username ?? '').trim();
  if (un) return un;
  return emptyLabel;
}

export function DeliveryByAreaPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [driverId, setDriverId] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [areaDebounced, setAreaDebounced] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const tmr = window.setTimeout(() => setAreaDebounced(areaInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [areaInput]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter === 'ALL') p.status = 'ALL';
    else if (statusFilter) p.status = statusFilter;
    if (isAdmin && driverId) p.driverId = driverId;
    if (areaDebounced) p.area = areaDebounced;
    if (searchDebounced) p.search = searchDebounced;
    return p;
  }, [statusFilter, driverId, areaDebounced, searchDebounced, isAdmin]);

  const [deliverId, setDeliverId] = useState<string | null>(null);
  const [proof, setProof] = useState('');
  const [assignDistId, setAssignDistId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [forceDist, setForceDist] = useState<{ id: string; blocked: DeleteBlockedPayload } | null>(null);
  const [forceDistConfirm, setForceDistConfirm] = useState('');
  const [forceDistReason, setForceDistReason] = useState('');
  const [forceDistPending, setForceDistPending] = useState(false);

  const { data, isPending, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['distributions', 'by-area', queryParams],
    queryFn: async () =>
      (await api.get<DistributionByAreaResponse>('/distributions/by-area', { params: queryParams })).data,
    placeholderData: (prev) => prev,
  });

  const showSkeleton = isPending && !isPlaceholderData;

  const { data: deliveryUsersRaw } = useQuery({
    queryKey: ['users', 'delivery-assign', 'by-area'],
    enabled: isAdmin && Boolean(assignDistId),
    queryFn: async () =>
      (
        await api.get('/users', {
          params: role === 'SUPER_ADMIN' ? { role: 'DELIVERY' } : undefined,
        })
      ).data,
  });
  const deliveryUsers = useMemo(
    (): UserSelectOption[] => (Array.isArray(deliveryUsersRaw) ? deliveryUsersRaw : []),
    [deliveryUsersRaw],
  );

  async function invalidateDistributionQueries() {
    await qc.invalidateQueries({ queryKey: ['distributions'] });
    await qc.invalidateQueries({ queryKey: ['distributions', 'by-area'] });
    await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    await qc.invalidateQueries({ queryKey: ['stock'] });
    await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
  }

  async function confirmDelivery() {
    if (!deliverId) return;
    try {
      await api.patch(`/distributions/${deliverId}/confirm-delivery`, { deliveryProofNote: proof || undefined });
      toast.success(t('distributions.deliverSuccess'));
      setDeliverId(null);
      setProof('');
      await invalidateDistributionQueries();
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('distributions.deliverError'),
      );
    }
  }

  async function assignDriver() {
    if (!assignDistId || !assignDriverId) return;
    try {
      await api.patch(`/distributions/${assignDistId}/assign-driver`, { driverId: assignDriverId });
      toast.success(t('distributions.assignDriverSuccess'));
      setAssignDistId(null);
      setAssignDriverId('');
      await invalidateDistributionQueries();
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('distributions.assignDriverError'),
      );
    }
  }

  async function cancelDist() {
    if (!cancelId) return;
    try {
      await api.patch(`/distributions/${cancelId}/cancel`);
      toast.success(t('distributions.cancelSuccess'));
      setCancelId(null);
      await invalidateDistributionQueries();
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.updateError'),
      );
    }
  }

  async function removeDist() {
    if (!deleteId) return;
    const id = deleteId;
    try {
      await api.delete(`/distributions/${id}`);
      toast.success(t('distributions.deleteSuccess'));
      setDeleteId(null);
      await invalidateDistributionQueries();
    } catch (e: unknown) {
      const blocked = parseDeleteBlocked(e);
      if (blocked && role === 'SUPER_ADMIN') {
        setDeleteId(null);
        setForceDist({ id, blocked });
        setForceDistConfirm('');
        setForceDistReason('');
        return;
      }
      if (blocked) {
        toast.error(blocked.message);
        setDeleteId(null);
        return;
      }
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.updateError'));
    }
  }

  async function confirmForceDist() {
    if (!forceDist) return;
    if (forceDistConfirm.trim() !== 'DELETE') {
      toast.error(t('adminOverride.mustTypeDelete'));
      return;
    }
    setForceDistPending(true);
    try {
      await api.post(`/distributions/${forceDist.id}/force-delete`, {
        confirmationText: forceDistConfirm.trim(),
        reason: forceDistReason.trim() || undefined,
      });
      toast.success(t('distributions.deleteSuccess'));
      setForceDist(null);
      setForceDistConfirm('');
      setForceDistReason('');
      await invalidateDistributionQueries();
    } catch (e: unknown) {
      const fb = parseForceDeleteForbidden(e);
      if (fb) {
        toast.error(fb.message);
        return;
      }
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('common.updateError'));
    } finally {
      setForceDistPending(false);
    }
  }

  function distributionActions(d: DistributionListRow) {
    return (
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {isAdmin && d.status === 'PENDING' ? (
          <>
            <Button
              className="h-9 flex-1 px-2 text-xs sm:flex-initial"
              variant="primary"
              type="button"
              onClick={() => {
                setAssignDistId(d.id);
                setAssignDriverId('');
              }}
            >
              {t('distributions.assignDriver')}
            </Button>
            <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
              {t('distributions.cancel')}
            </Button>
            <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
              {t('common.delete')}
            </Button>
          </>
        ) : null}
        {isAdmin && d.status === 'ASSIGNED' ? (
          <>
            <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
              {t('distributions.cancel')}
            </Button>
            {role === 'SUPER_ADMIN' ? (
              <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                {t('common.delete')}
              </Button>
            ) : null}
          </>
        ) : null}
        {role === 'SUPER_ADMIN' && d.status === 'CANCELLED' ? (
          <Button className="h-9 px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
            {t('common.delete')}
          </Button>
        ) : null}
        {role === 'DELIVERY' && d.status === 'ASSIGNED' ? (
          <Button className="h-9 flex-1 px-2 text-xs" variant="primary" type="button" onClick={() => setDeliverId(d.id)}>
            {t('distributions.confirmDeliver')}
          </Button>
        ) : null}
        {d.status === 'DELIVERED' ? (
          <span className="text-xs text-muted-foreground">{t('distributions.deliveredBadge')}</span>
        ) : null}
      </div>
    );
  }

  const areas = data?.areas ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold">{t('deliveryByArea.title')}</h1>
            <Link to="/app/distributions" className="text-sm font-medium text-primary hover:underline">
              {t('deliveryByArea.linkTable')}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">{t('deliveryByArea.subtitle')}</p>
        </div>
      </div>

      <Card
        className={cn(
          'space-y-3 p-4',
          isPlaceholderData && isFetching && 'opacity-[0.92] transition-opacity',
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">{t('distributions.colStatus')}</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{t('deliveryByArea.filterStatusPlanning')}</option>
                <option value="ALL">{t('deliveryByArea.filterStatusAll')}</option>
                <option value="PENDING">{t('distributions.statusPending')}</option>
                <option value="ASSIGNED">{t('distributions.statusAssigned')}</option>
                <option value="DELIVERED">{t('distributions.statusDelivered')}</option>
                <option value="CANCELLED">{t('distributions.statusCancelled')}</option>
              </select>
            </div>
            {isAdmin ? (
              <div className="space-y-1">
                <Label className="text-xs">{t('deliveryByArea.filterDriver')}</Label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">{t('deliveryByArea.filterDriverAll')}</option>
                  {deliveryUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.displayName ?? '').trim() || u.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs">{t('deliveryByArea.filterArea')}</Label>
              <Input
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                placeholder={t('deliveryByArea.filterAreaPlaceholder')}
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs">{t('distributions.searchPlaceholder')}</Label>
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
          </div>
        </div>

        {!showSkeleton && total > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('deliveryByArea.totalBanner', { total, areas: areas.length })}
          </p>
        ) : null}
      </Card>

      {showSkeleton ? (
        <DeliveryByAreaSkeleton sections={3} />
      ) : areas.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">{t('deliveryByArea.empty')}</Card>
      ) : (
        <div className="space-y-3">
          {areas.map((area) => (
            <details
              key={area.areaKey}
              className="group overflow-hidden rounded-lg border border-border bg-card open:bg-muted/5"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/25 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  <span className="font-semibold text-foreground">{area.areaLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('deliveryByArea.areaSummary', {
                      distCount: area.distributionCount,
                      benCount: area.beneficiaryCount,
                    })}
                  </span>
                </div>
              </summary>
              <div className="space-y-3 p-3 sm:p-4">
                {area.distributions.map((d) => (
                  <Card key={d.id} className="border-border bg-muted/10 p-4 text-sm shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 font-semibold">{d.beneficiary?.fullName ?? t('common.dash')}</div>
                      <DistributionStatusBadge status={d.status} />
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('distributions.colPhone')}</dt>
                        <dd className="font-medium">
                          {d.beneficiary?.phone?.trim() ? d.beneficiary.phone : t('common.dash')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('distributions.colAssignedTo')}</dt>
                        <dd className="font-medium">{personDisplayName(d.driver, t('distributions.notAssigned'))}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">{t('distributions.colAddress')}</dt>
                        <dd>
                          <DistributionBeneficiaryAddress b={d.beneficiary} t={t} dash={t('common.dash')} />
                        </dd>
                      </div>
                      {d.outForDeliveryAt && d.status === 'ASSIGNED' ? (
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">{t('deliveryByArea.outForDeliveryAt')}</dt>
                          <dd className="text-xs">
                            {new Date(d.outForDeliveryAt).toLocaleString()}
                          </dd>
                        </div>
                      ) : null}
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">{t('distributions.colLines')}</dt>
                        <dd>
                          <ul className="mt-1 space-y-1">
                            {(d.items ?? []).map((it) => (
                              <li key={it.id}>{formatDistLine(it, t)}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    </dl>
                    {distributionActions(d)}
                  </Card>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(deliverId)}
        onClose={() => setDeliverId(null)}
        title={t('distributions.deliverTitle')}
        description={t('distributions.deliverDesc')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDeliverId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void confirmDelivery()}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>{t('distributions.labelProof')}</Label>
          <Input value={proof} onChange={(e) => setProof(e.target.value)} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(assignDistId)}
        onClose={() => {
          setAssignDistId(null);
          setAssignDriverId('');
        }}
        title={t('distributions.assignDriverTitle')}
        description={t('distributions.assignDriverDesc')}
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setAssignDistId(null);
                setAssignDriverId('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!assignDriverId} onClick={() => void assignDriver()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>{t('distributions.selectDriver')}</Label>
          <select
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={assignDriverId}
            onChange={(e) => setAssignDriverId(e.target.value)}
          >
            <option value="">{t('common.dash')}</option>
            {deliveryUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.username})
              </option>
            ))}
          </select>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(cancelId)}
        onClose={() => setCancelId(null)}
        title={t('distributions.cancelTitle')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setCancelId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void cancelDist()}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('distributions.cancelBody')}</p>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title={t('distributions.deleteTitle')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void removeDist()}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('distributions.deleteBody')}</p>
      </Dialog>

      <Dialog
        open={Boolean(forceDist)}
        onClose={() => {
          setForceDist(null);
          setForceDistConfirm('');
          setForceDistReason('');
        }}
        title={t('adminOverride.forceTitleDistribution')}
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setForceDist(null);
                setForceDistConfirm('');
                setForceDistReason('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={forceDistPending} onClick={() => void confirmForceDist()}>
              {forceDistPending ? t('common.saving') : t('adminOverride.forceDelete')}
            </Button>
          </>
        }
      >
        {forceDist ? (
          <AdminForceDeletePanel
            t={t}
            blocked={forceDist.blocked}
            confirmValue={forceDistConfirm}
            onConfirmChange={setForceDistConfirm}
            reason={forceDistReason}
            onReasonChange={setForceDistReason}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
