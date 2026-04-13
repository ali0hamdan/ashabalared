import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">{t('dashboard.loading')}</div>;
  }

  if (role === 'DELIVERY') {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.deliveryWelcome')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.deliverySubtitle')}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Stat title={t('dashboard.statPending')} value={data.pendingOpen ?? 0} hint={t('dashboard.statPendingHint')} />
          <Stat title={t('dashboard.statToday')} value={data.myDeliveredToday ?? 0} hint={t('dashboard.statTodayHint')} />
        </div>
        <Card>
          <CardTitle>{t('dashboard.goDistTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.goDistDesc')}</CardDescription>
          <div className="mt-4">
            <Link className="text-sm font-medium text-primary hover:underline" to="/app/distributions">
              {t('dashboard.goDistLink')}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const lowChart =
    Array.isArray(data.lowStock) && data.lowStock.length
      ? data.lowStock.slice(0, 8).map((x: { itemName?: string; remaining?: number }) => ({
          name: x.itemName ?? '—',
          available: x.remaining ?? 0,
        }))
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.overviewTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.overviewSubtitle')}</p>
      </div>

      {role === 'SUPER_ADMIN' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Stat title={t('dashboard.beneficiariesTotal')} value={data.beneficiariesTotal} />
          <Stat title={t('dashboard.admins')} value={data.admins} />
          <Stat title={t('dashboard.deliveryUsers')} value={data.deliveryUsers} />
          <Stat title={t('dashboard.distributionsTotal')} value={data.distributionsTotal} />
          <Stat title={t('dashboard.pendingDist')} value={data.pendingDist} />
          <Stat title={t('dashboard.deliveredToday')} value={data.deliveredToday} />
          <Stat title={t('dashboard.lowStockCount')} value={data.lowStockCount ?? data.lowStock?.length ?? 0} hint={t('dashboard.lowStockHint')} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title={t('dashboard.beneficiariesActive')} value={data.beneficiariesActive} />
          <Stat title={t('dashboard.pendingRequests')} value={data.pendingRequests} />
          <Stat title={t('dashboard.deliveredToday')} value={data.deliveredToday} />
          <Stat title={t('dashboard.lowStockCount')} value={data.lowStockCount ?? data.lowStock?.length ?? 0} hint={t('dashboard.lowStockHint')} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{t('dashboard.lowStockTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.lowStockDesc')}</CardDescription>
          <div className="mt-4 h-56 w-full min-h-56 min-w-0">
            {lowChart.length ? (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={lowChart}>
                  <XAxis dataKey="name" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="available" fill="hsl(199 89% 38%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('dashboard.noAlerts')}</div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>{t('dashboard.quickTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.quickDesc')}</CardDescription>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Quick to="/app/beneficiaries" label={t('dashboard.quickBeneficiaries')} />
            <Quick to="/app/categories" label={t('dashboard.quickCategories')} />
            <Quick to="/app/stock" label={t('dashboard.quickStock')} />
            <Quick to="/app/distributions/new" label={t('dashboard.quickDistributions')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function Quick({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm font-medium hover:bg-muted/60"
    >
      {label}
    </Link>
  );
}
