import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { BeneficiaryStatusBadge } from '@/components/StatusBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { PaginatedResponse } from '@/lib/paginated';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import { parseDeleteBlocked, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';
import { DataTableShell } from '@/components/layout/DataTableShell';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PaginationControls } from '@/components/pagination-controls';
import { BeneficiariesTableSkeleton } from '@/components/table-skeletons';

/** Labels for table chips: catalog items (needed) first, else legacy category names. */
type BeneficiaryNeedChipSource = {
  itemNeeds?: Array<{ needed?: boolean; quantity?: number; aidCategoryItem?: { name?: string | null } | null }>;
  categories?: Array<{ quantity?: number; category?: { name?: string | null } | null }>;
};

type BeneficiaryListRow = BeneficiaryNeedChipSource & {
  id: string;
  fullName?: string | null;
  phone?: string | null;
  area?: string | null;
  status?: string;
  familyCount?: number;
  _count?: { distributions?: number };
};

function beneficiaryNeedChipLabels(b: BeneficiaryNeedChipSource): string[] {
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
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const tmr = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(tmr);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  const [delRow, setDelRow] = useState<{ id: string; fullName: string } | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [forceBen, setForceBen] = useState<{ id: string; fullName: string; blocked: DeleteBlockedPayload } | null>(null);
  const [forceBenConfirm, setForceBenConfirm] = useState('');
  const [forceBenReason, setForceBenReason] = useState('');
  const [forceBenPending, setForceBenPending] = useState(false);

  const { data, isPending, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['beneficiaries', searchDebounced, page, pageSize],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<BeneficiaryListRow>>('/beneficiaries', {
          params: {
            search: searchDebounced || undefined,
            page,
            limit: pageSize,
          },
        })
      ).data,
    placeholderData: (prev) => prev,
  });

  /** First paint with no cached or placeholder rows — show skeleton, not empty state */
  const showInitialSkeleton = isPending && !isPlaceholderData;
  const rows = useMemo((): BeneficiaryListRow[] => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

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
    <div className="space-y-8">
      <PageHeader
        title={t('beneficiaries.title')}
        description={t('beneficiaries.subtitle')}
        actions={
          <>
            <Button variant="outline" type="button" className="min-h-10 min-w-[10rem] flex-1 sm:flex-initial" onClick={() => void exportCsv()}>
              {t('beneficiaries.exportCsv')}
            </Button>
            <Link
              to="/app/beneficiaries/new"
              className={cn(
                'inline-flex min-h-10 min-w-[10rem] flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-initial',
              )}
            >
              {t('beneficiaries.add')}
            </Link>
          </>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <Input
            className="w-full flex-1"
            placeholder={t('beneficiaries.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="button" variant="outline" className="min-h-11 shrink-0 sm:min-w-[7.5rem]" onClick={() => void refetch()}>
            {t('common.apply')}
          </Button>
        </div>
      </Card>

      <DataTableShell
        className={cn(isPlaceholderData && isFetching && 'opacity-[0.94] transition-opacity')}
        footer={
          data && totalPages > 1 ? (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              isFetching={isFetching && !showInitialSkeleton}
              summary={t('beneficiaries.pagingSummary', {
                page,
                totalPages,
                total,
              })}
              prevLabel={t('beneficiaries.pagingPrev')}
              nextLabel={t('beneficiaries.pagingNext')}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              className="border-t-0 px-4 py-3"
            />
          ) : undefined
        }
      >
        {showInitialSkeleton ? (
          <div className="p-0" aria-busy={true} aria-label={t('common.loading')}>
            <BeneficiariesTableSkeleton rows={10} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('common.noResults')} description={t('beneficiaries.subtitle')}>
            <Link
              to="/app/beneficiaries/new"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('beneficiaries.add')}
            </Link>
          </EmptyState>
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
            <thead className="data-table-head">
              <tr>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colName')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colPhone')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colArea')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colNeeds')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colFamily')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colStatus')}
                </th>
                <th scope="col" className="data-table-th border-e border-border/50">
                  {t('beneficiaries.colDistributions')}
                </th>
                <th scope="col" className="data-table-th">
                  {t('beneficiaries.colActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className={cn(
                    'data-table-row border-b border-border/60',
                    b.status === 'INACTIVE' && 'bg-muted/30 text-muted-foreground',
                  )}
                >
                  <td className="data-table-td border-e border-border/40 break-words">
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`/app/beneficiaries/${b.id}`}>
                      {b.fullName}
                    </Link>
                  </td>
                  <td className="data-table-td border-e border-border/40 break-words tabular-nums">{b.phone}</td>
                  <td className="data-table-td border-e border-border/40 break-words">{b.area?.trim() ? b.area : t('common.dash')}</td>
                  <td className="data-table-td border-e border-border/40 align-top">
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
                  <td className="data-table-td border-e border-border/40 tabular-nums">{b.familyCount}</td>
                  <td className="data-table-td border-e border-border/40">
                    <span className="inline-flex">
                      <BeneficiaryStatusBadge status={b.status} />
                    </span>
                  </td>
                  <td className="data-table-td border-e border-border/40 tabular-nums">{b._count?.distributions ?? 0}</td>
                  <td className="data-table-td">
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
      </DataTableShell>

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
