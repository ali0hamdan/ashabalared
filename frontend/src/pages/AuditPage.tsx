import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', action],
    queryFn: async () => (await api.get('/audit-logs', { params: { action: action || undefined } })).data,
  });
  const rows = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const dateLocale = i18n.language.startsWith('ar') ? 'ar' : 'en-US';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
      </div>

      <Card className="p-4">
        <label className="text-sm font-medium">{t('audit.filterLabel')}</label>
        <input
          className="mt-2 h-10 w-full max-w-md rounded-md border border-border bg-card px-3 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t('audit.filterPlaceholder')}
        />
      </Card>

      <Card className="max-w-full overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-start">
              <tr className="border-b border-border">
                <th className="p-3">{t('audit.colTime')}</th>
                <th className="p-3">{t('audit.colAction')}</th>
                <th className="p-3">{t('audit.colEntityType')}</th>
                <th className="p-3">{t('audit.colEntityId')}</th>
                <th className="p-3">{t('audit.colUser')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l: any) => (
                <tr key={l.id} className="border-b border-border hover:bg-muted/20">
                  <td className="p-3 whitespace-nowrap">{new Date(l.createdAt).toLocaleString(dateLocale)}</td>
                  <td className="p-3 font-mono text-xs">{l.action}</td>
                  <td className="p-3">{l.entityType}</td>
                  <td className="p-3 font-mono text-xs">{l.entityId ?? t('common.dash')}</td>
                  <td className="p-3">{l.actor?.displayName ?? t('common.dash')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
