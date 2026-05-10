import { DataTableShell } from '@/components/layout/DataTableShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuditTableSkeleton } from '@/components/table-skeletons';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditLogRow, AuditLogsPayload } from '@/types/api-shapes';

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', action],
    queryFn: async () => (await api.get<AuditLogsPayload>('/audit-logs', { params: { action: action || undefined } })).data,
  });
  const rows = useMemo((): AuditLogRow[] => (Array.isArray(data?.items) ? data.items : []), [data]);
  const dateLocale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';

  return (
    <div className="space-y-8">
      <PageHeader title={t('audit.title')} description={t('audit.subtitle')} />

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-5 dark:shadow-none">
        <Label htmlFor="audit-action-filter">{t('audit.filterLabel')}</Label>
        <Input
          id="audit-action-filter"
          className="mt-2 max-w-md"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t('audit.filterPlaceholder')}
          autoComplete="off"
        />
      </div>

      <DataTableShell>
        {isLoading ? (
          <div className="p-0" aria-busy={true}>
            <AuditTableSkeleton rows={12} />
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="data-table-head">
              <tr>
                <th className="data-table-th border-e border-border/40">{t('audit.colTime')}</th>
                <th className="data-table-th border-e border-border/40">{t('audit.colAction')}</th>
                <th className="data-table-th border-e border-border/40">{t('audit.colEntityType')}</th>
                <th className="data-table-th border-e border-border/40">{t('audit.colEntityId')}</th>
                <th className="data-table-th">{t('audit.colUser')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="data-table-row border-b border-border/60">
                  <td className="data-table-td border-e border-border/40 whitespace-nowrap tabular-nums">
                    {new Date(l.createdAt).toLocaleString(dateLocale)}
                  </td>
                  <td className="data-table-td border-e border-border/40 font-mono text-xs">{l.action}</td>
                  <td className="data-table-td border-e border-border/40">{l.entityType}</td>
                  <td className="data-table-td border-e border-border/40 font-mono text-xs break-all">{l.entityId ?? t('common.dash')}</td>
                  <td className="data-table-td">{l.actor?.displayName ?? t('common.dash')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>
    </div>
  );
}
