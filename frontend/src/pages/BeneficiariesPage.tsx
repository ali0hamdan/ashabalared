import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { BeneficiaryStatusBadge } from '@/components/StatusBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import { parseDeleteBlocked, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';

/** Labels for table chips: catalog items (needed) first, else legacy category names. */
function beneficiaryNeedChipLabels(b: {
  itemNeeds?: Array<{ needed?: boolean; quantity?: number; aidCategoryItem?: { name?: string | null } | null }>;
  categories?: Array<{ quantity?: number; category?: { name?: string | null } | null }>;
}): string[] {
  const items = (b.itemNeeds ?? []).filter((n) => n.needed && (n.quantity ?? 0) >= 1);
  const fromItems = [...new Set(items.map((n) => n.aidCategoryItem?.name).filter((x): x is string => Boolean(x?.trim())))].sort((a, c) =>
    a.localeCompare(c),
  );
  if (fromItems.length) return fromItems;
  const cats = b.categories ?? [];
  return [...new Set(cats.map((n) => n.category?.name).filter((x): x is string => Boolean(x?.trim())))].sort((a, c) =>
    a.localeCompare(c),
  );
}

function deleteErrorMessage(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(m)) return m.filter(Boolean).join(' ');
  if (typeof m === 'string' && m.trim()) return m.trim();
  return fallback;
}

export function BeneficiariesPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [delRow, setDelRow] = useState<{ id: string; fullName: string } | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [forceBen, setForceBen] = useState<{ id: string; fullName: string; blocked: DeleteBlockedPayload } | null>(null);
  const [forceBenConfirm, setForceBenConfirm] = useState('');
  const [forceBenReason, setForceBenReason] = useState('');
  const [forceBenPending, setForceBenPending] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['beneficiaries', q],
    queryFn: async () => (await api.get('/beneficiaries', { params: { q: q || undefined } })).data,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  async function archiveBeneficiary() {
    if (!delRow) return;
    setArchivePending(true);
    try {
      await api.delete(`/beneficiaries/${delRow.id}`);
      toast.success(t('beneficiaries.deleteSuccess'));
      setDelRow(null);
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['distributions'] });
    } catch (e: unknown) {
      const blocked = parseDeleteBlocked(e);
      if (blocked && role === 'SUPER_ADMIN') {
        setForceBen({ id: delRow.id, fullName: delRow.fullName, blocked });
        setDelRow(null);
        setForceBenConfirm('');
        setForceBenReason('');
      } else if (blocked) {
        toast.error(blocked.message);
        setDelRow(null);
      } else {
        toast.error(deleteErrorMessage(e, t('common.updateError')));
      }
    } finally {
      setArchivePending(false);
    }
  }

  async function forceArchiveBeneficiary() {
    if (!forceBen) return;
    if (forceBenConfirm.trim() !== 'DELETE') {
      toast.error(t('adminOverride.mustTypeDelete'));
      return;
    }
    setForceBenPending(true);
    try {
      await api.post(`/beneficiaries/${forceBen.id}/force-archive`, {
        confirmationText: forceBenConfirm.trim(),
        reason: forceBenReason.trim() || undefined,
      });
      toast.success(t('beneficiaries.forceArchiveSuccess'));
      setForceBen(null);
      setForceBenConfirm('');
      setForceBenReason('');
      await qc.invalidateQueries({ queryKey: ['beneficiaries'] });
      await qc.invalidateQueries({ queryKey: ['beneficiaries-history'] });
      await qc.invalidateQueries({ queryKey: ['distributions'] });
    } catch (e: unknown) {
      toast.error(deleteErrorMessage(e, t('common.updateError')));
    } finally {
      setForceBenPending(false);
    }
  }

  async function exportCsv() {
    try {
      const res = await api.get('/beneficiaries/export/csv', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beneficiaries.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.exportSuccess'));
    } catch {
      toast.error(t('common.exportError'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('beneficiaries.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('beneficiaries.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <Button variant="outline" type="button" className="h-10 min-w-[10rem] flex-1 sm:flex-initial" onClick={() => void exportCsv()}>
            {t('beneficiaries.exportCsv')}
          </Button>
          <Link
            to="/app/beneficiaries/new"
            className={cn(
              'inline-flex h-10 min-w-[10rem] flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95 sm:flex-initial',
            )}
          >
            {t('beneficiaries.add')}
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <Input
            className="min-h-10 w-full flex-1"
            placeholder={t('beneficiaries.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="button" variant="outline" className="h-10 shrink-0 sm:min-w-[7.5rem]" onClick={() => void refetch()}>
            {t('common.apply')}
          </Button>
        </div>
      </Card>

      <Card className="max-w-full overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t('common.noResults')}</div>
        ) : (
          <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colName')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colPhone')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colArea')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colNeeds')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colFamily')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colStatus')}
                </th>
                <th scope="col" className="border-e border-border px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colDistributions')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium text-foreground">
                  {t('beneficiaries.colActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b: any) => (
                <tr
                  key={b.id}
                  className={cn(
                    'border-b border-border hover:bg-muted/30',
                    b.status === 'INACTIVE' && 'bg-muted/25 text-muted-foreground',
                  )}
                >
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words">
                    <Link className="font-medium text-primary hover:underline" to={`/app/beneficiaries/${b.id}`}>
                      {b.fullName}
                    </Link>
                  </td>
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words tabular-nums">
                    {b.phone}
                  </td>
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start break-words">
                    {b.area?.trim() ? b.area : t('common.dash')}
                  </td>
                  <td className="border-e border-border px-3 py-2.5 align-top text-start">
                    {(() => {
                      const labels = beneficiaryNeedChipLabels(b);
                      if (!labels.length) {
                        return <span className="text-muted-foreground">{t('common.dash')}</span>;
                      }
                      const more = labels.length - 3;
                      return (
                        <div className="flex max-w-[14rem] flex-wrap gap-1">
                          {labels.slice(0, 3).map((name) => (
                            <span
                              key={name}
                              className="inline-block max-w-[7.5rem] truncate rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                              title={name}
                            >
                              {name}
                            </span>
                          ))}
                          {more > 0 ? (
                            <span className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                              {t('beneficiaries.needsMore', { count: more })}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start tabular-nums">{b.familyCount}</td>
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start">
                    <span className="inline-flex">
                      <BeneficiaryStatusBadge status={b.status} />
                    </span>
                  </td>
                  <td className="border-e border-border px-3 py-2.5 align-middle text-start tabular-nums">{b._count?.distributions ?? 0}</td>
                  <td className="px-3 py-2.5 align-middle text-start">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={() => setDelRow({ id: b.id, fullName: b.fullName ?? '' })}
                    >
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog
        open={Boolean(delRow)}
        onClose={() => setDelRow(null)}
        title={t('beneficiaries.deleteTitle')}
        description={delRow ? t('beneficiaries.deleteDesc', { name: delRow.fullName }) : undefined}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDelRow(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={archivePending} onClick={() => void archiveBeneficiary()}>
              {archivePending ? t('common.saving') : t('common.delete')}
            </Button>
          </>
        }
      >
        <span className="sr-only">{delRow?.fullName}</span>
      </Dialog>

      <Dialog
        open={Boolean(forceBen)}
        onClose={() => {
          setForceBen(null);
          setForceBenConfirm('');
          setForceBenReason('');
        }}
        title={t('adminOverride.forceTitleBeneficiary')}
        description={forceBen ? t('beneficiaries.deleteDesc', { name: forceBen.fullName }) : undefined}
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setForceBen(null);
                setForceBenConfirm('');
                setForceBenReason('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={forceBenPending} onClick={() => void forceArchiveBeneficiary()}>
              {forceBenPending ? t('common.saving') : t('adminOverride.forceArchive')}
            </Button>
          </>
        }
      >
        {forceBen ? (
          <AdminForceDeletePanel
            t={t}
            blocked={forceBen.blocked}
            confirmValue={forceBenConfirm}
            onConfirmChange={setForceBenConfirm}
            reason={forceBenReason}
            onReasonChange={setForceBenReason}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
