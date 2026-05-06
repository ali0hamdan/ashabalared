import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DistributionStatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { parseDeleteBlocked, parseForceDeleteForbidden, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';

function formatDistLine(it: any, t: TFunction) {
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

function beneficiaryAreaForDistribution(b: any): string {
  const fromRegion = trimMeaningfulText(b?.region?.nameAr);
  if (fromRegion) return fromRegion;
  return trimMeaningfulText(b?.area);
}

function beneficiaryStreetForDistribution(b: any): string {
  const line =
    b?.addressLine !== undefined && b?.addressLine !== null ? b.addressLine : b?.street;
  return trimMeaningfulText(line);
}

function DistributionBeneficiaryAddress({
  b,
  t,
  dash,
}: {
  b: any;
  t: TFunction;
  dash: string;
}) {
  const area = beneficiaryAreaForDistribution(b);
  const street = beneficiaryStreetForDistribution(b);
  if (!area && !street) return <span>{dash}</span>;
  return (
    <div className="min-w-[10rem] max-w-[18rem] space-y-0.5">
      {area ? (
        <div className="text-sm leading-snug">
          <span className="text-muted-foreground">{t('beneficiaryNew.area')}: </span>
          <span className="font-medium">{area}</span>
        </div>
      ) : null}
      {street ? (
        <div
          className={
            area
              ? 'text-xs leading-snug text-muted-foreground whitespace-pre-wrap'
              : 'text-sm leading-snug whitespace-pre-wrap'
          }
        >
          <span className={area ? '' : 'text-muted-foreground'}>
            {t('distributions.addressDetailLabel')}:{' '}
          </span>
          <span className={area ? '' : 'font-medium'}>{street}</span>
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

export function DistributionsPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['distributions', status, searchDebounced],
    queryFn: async () =>
      (
        await api.get('/distributions', {
          params: {
            status: status || undefined,
            q: searchDebounced || undefined,
          },
        })
      ).data,
  });
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const [deliverId, setDeliverId] = useState<string | null>(null);
  const [proof, setProof] = useState('');
  const [assignDistId, setAssignDistId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [forceDist, setForceDist] = useState<{ id: string; blocked: DeleteBlockedPayload } | null>(null);
  const [forceDistConfirm, setForceDistConfirm] = useState('');
  const [forceDistReason, setForceDistReason] = useState('');
  const [forceDistPending, setForceDistPending] = useState(false);

  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const { data: deliveryUsersRaw } = useQuery({
    queryKey: ['users', 'delivery-assign', role],
    enabled: Boolean(assignDistId) && isAdmin,
    queryFn: async () =>
      (
        await api.get('/users', {
          params: role === 'SUPER_ADMIN' ? { role: 'DELIVERY' } : undefined,
        })
      ).data,
  });
  const deliveryUsers = useMemo(() => (Array.isArray(deliveryUsersRaw) ? deliveryUsersRaw : []), [deliveryUsersRaw]);

  async function confirmDelivery() {
    if (!deliverId) return;
    try {
      await api.patch(`/distributions/${deliverId}/confirm-delivery`, { deliveryProofNote: proof || undefined });
      toast.success(t('distributions.deliverSuccess'));
      setDeliverId(null);
      setProof('');
      await qc.invalidateQueries({ queryKey: ['distributions'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t('distributions.deliverError'));
    }
  }

  async function assignDriver() {
    if (!assignDistId || !assignDriverId) return;
    try {
      await api.patch(`/distributions/${assignDistId}/assign-driver`, { driverId: assignDriverId });
      toast.success(t('distributions.assignDriverSuccess'));
      setAssignDistId(null);
      setAssignDriverId('');
      await qc.invalidateQueries({ queryKey: ['distributions'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t('distributions.assignDriverError'));
    }
  }

  async function cancelDist() {
    if (!cancelId) return;
    try {
      await api.patch(`/distributions/${cancelId}/cancel`);
      toast.success(t('distributions.cancelSuccess'));
      setCancelId(null);
      await qc.invalidateQueries({ queryKey: ['distributions'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t('common.updateError'));
    }
  }

  async function removeDist() {
    if (!deleteId) return;
    const id = deleteId;
    try {
      await api.delete(`/distributions/${id}`);
      toast.success(t('distributions.deleteSuccess'));
      setDeleteId(null);
      await qc.invalidateQueries({ queryKey: ['distributions'] });
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
      await qc.invalidateQueries({ queryKey: ['distributions'] });
      await qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('distributions.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('distributions.subtitle')}</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-stretch gap-2 md:ms-auto md:w-auto md:max-w-full md:justify-end">
          {isAdmin && (
            <Link
              to="/app/distributions/new"
              className="inline-flex h-10 min-h-[2.5rem] min-w-0 flex-1 items-center justify-center rounded-md bg-primary px-3 text-center text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95 sm:flex-initial sm:px-4"
            >
              {t('distributions.newManual')}
            </Link>
          )}
          <Input
            className="h-10 min-h-[2.5rem] min-w-[12rem] flex-1 md:max-w-sm"
            placeholder={t('distributions.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t('distributions.searchPlaceholder')}
          />
          <select
            className="h-10 min-h-[2.5rem] min-w-[8rem] flex-1 rounded-md border border-border bg-card px-3 text-sm sm:w-auto sm:flex-initial"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('distributions.filterAll')}</option>
            <option value="PENDING">{t('distributions.statusPending')}</option>
            <option value="ASSIGNED">{t('distributions.statusAssigned')}</option>
            <option value="DELIVERED">{t('distributions.statusDelivered')}</option>
            <option value="CANCELLED">{t('distributions.statusCancelled')}</option>
          </select>
        </div>
      </div>

      <Card className="max-w-full overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t('distributions.noResults')}</div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-muted/40 text-start">
                  <tr className="border-b border-border">
                    <th className="p-3">{t('distributions.colBeneficiary')}</th>
                    <th className="p-3">{t('distributions.colAddress')}</th>
                    <th className="p-3">{t('distributions.colPhone')}</th>
                    <th className="p-3">{t('distributions.colStatus')}</th>
                    <th className="p-3">{t('distributions.colCreatedBy')}</th>
                    <th className="p-3">{t('distributions.colAssignedTo')}</th>
                    <th className="p-3">{t('distributions.colConfirmedBy')}</th>
                    <th className="p-3">{t('distributions.colLines')}</th>
                    <th className="p-3">{t('distributions.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d: any) => (
                    <tr key={d.id} className="border-b border-border align-top hover:bg-muted/20">
                      <td className="p-3 font-medium">{d.beneficiary?.fullName ?? t('common.dash')}</td>
                      <td className="p-3 align-top">
                        <DistributionBeneficiaryAddress b={d.beneficiary} t={t} dash={t('common.dash')} />
                      </td>
                      <td className="p-3 whitespace-nowrap">{d.beneficiary?.phone?.trim() ? d.beneficiary.phone : t('common.dash')}</td>
                      <td className="p-3">
                        <DistributionStatusBadge status={d.status} />
                      </td>
                      <td className="p-3">{personDisplayName(d.createdBy, t('common.dash'))}</td>
                      <td className="p-3 font-medium">{personDisplayName(d.driver, t('distributions.notAssigned'))}</td>
                      <td className="p-3">
                        {d.status === 'DELIVERED'
                          ? personDisplayName(d.completedBy, t('common.dash'))
                          : t('common.dash')}
                      </td>
                      <td className="p-3">
                        <ul className="space-y-1">
                          {(d.items ?? []).map((it: any) => (
                            <li key={it.id}>{formatDistLine(it, t)}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-3 space-y-2">
                        {isAdmin && d.status === 'PENDING' ? (
                          <>
                            <Button
                              className="h-9 w-full px-2 text-xs"
                              variant="primary"
                              type="button"
                              onClick={() => {
                                setAssignDistId(d.id);
                                setAssignDriverId('');
                              }}
                            >
                              {t('distributions.assignDriver')}
                            </Button>
                            <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
                              {t('distributions.cancel')}
                            </Button>
                            <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                              {t('common.delete')}
                            </Button>
                          </>
                        ) : null}
                        {isAdmin && d.status === 'ASSIGNED' ? (
                          <>
                            <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
                              {t('distributions.cancel')}
                            </Button>
                            {role === 'SUPER_ADMIN' ? (
                              <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                                {t('common.delete')}
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {role === 'SUPER_ADMIN' && d.status === 'CANCELLED' ? (
                          <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                            {t('common.delete')}
                          </Button>
                        ) : null}
                        {role === 'DELIVERY' && d.status === 'ASSIGNED' ? (
                          <Button className="h-9 w-full px-2 text-xs" variant="primary" type="button" onClick={() => setDeliverId(d.id)}>
                            {t('distributions.confirmDeliver')}
                          </Button>
                        ) : null}
                        {d.status === 'DELIVERED' ? (
                          <span className="text-xs text-muted-foreground">{t('distributions.deliveredBadge')}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 p-3">
              {rows.map((d: any) => (
                <div key={d.id} className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 font-semibold">{d.beneficiary?.fullName ?? t('common.dash')}</div>
                    <DistributionStatusBadge status={d.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('distributions.cardMeta')}</p>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t('distributions.colAddress')}</dt>
                      <dd>
                        <DistributionBeneficiaryAddress b={d.beneficiary} t={t} dash={t('common.dash')} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t('distributions.colPhone')}</dt>
                      <dd className="font-medium">{d.beneficiary?.phone?.trim() ? d.beneficiary.phone : t('common.dash')}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t('distributions.colCreatedBy')}</dt>
                      <dd className="font-medium">{personDisplayName(d.createdBy, t('common.dash'))}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t('distributions.colAssignedTo')}</dt>
                      <dd className="font-medium">{personDisplayName(d.driver, t('distributions.notAssigned'))}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t('distributions.colConfirmedBy')}</dt>
                      <dd className="font-medium">
                        {d.status === 'DELIVERED'
                          ? personDisplayName(d.completedBy, t('common.dash'))
                          : t('common.dash')}
                      </dd>
                    </div>
                  </dl>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('distributions.colLines')}</div>
                    <ul className="mt-1 space-y-1">
                      {(d.items ?? []).map((it: any) => (
                        <li key={it.id}>{formatDistLine(it, t)}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2 border-t border-border pt-3">
                    {isAdmin && d.status === 'PENDING' ? (
                      <>
                        <Button
                          className="h-9 w-full px-2 text-xs"
                          variant="primary"
                          type="button"
                          onClick={() => {
                            setAssignDistId(d.id);
                            setAssignDriverId('');
                          }}
                        >
                          {t('distributions.assignDriver')}
                        </Button>
                        <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
                          {t('distributions.cancel')}
                        </Button>
                        <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                          {t('common.delete')}
                        </Button>
                      </>
                    ) : null}
                    {isAdmin && d.status === 'ASSIGNED' ? (
                      <>
                        <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setCancelId(d.id)}>
                          {t('distributions.cancel')}
                        </Button>
                        {role === 'SUPER_ADMIN' ? (
                          <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                            {t('common.delete')}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {role === 'SUPER_ADMIN' && d.status === 'CANCELLED' ? (
                      <Button className="h-9 w-full px-2 text-xs" variant="outline" type="button" onClick={() => setDeleteId(d.id)}>
                        {t('common.delete')}
                      </Button>
                    ) : null}
                    {role === 'DELIVERY' && d.status === 'ASSIGNED' ? (
                      <Button className="h-9 w-full px-2 text-xs" variant="primary" type="button" onClick={() => setDeliverId(d.id)}>
                        {t('distributions.confirmDeliver')}
                      </Button>
                    ) : null}
                    {d.status === 'DELIVERED' ? (
                      <span className="text-xs text-muted-foreground">{t('distributions.deliveredBadge')}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

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
            {deliveryUsers.map((u: any) => (
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
