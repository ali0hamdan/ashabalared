import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';

export type DashboardSummary = {
  beneficiaries: {
    total: number;
    active: number;
    inactive: number;
  };
  distributions: {
    deliveredThisWeek: number;
    pending: number;
    assigned: number;
    failed: number;
  };
  stock: {
    lowStockCount: number;
    outOfStockCount: number;
    lowStockItems: Array<{
      stockItemId: string;
      itemName: string;
      categoryName: string;
      remaining: number;
      threshold: number;
      outOfStock: boolean;
    }>;
  };
  aidCategories: {
    mostRequested: Array<{
      categoryId: string;
      categoryName: string;
      requestScore: number;
    }>;
    mostDeliveredThisWeek: Array<{
      categoryId: string;
      categoryName: string;
      deliveredQuantity: number;
    }>;
  };
  driver?: {
    myDeliveredThisWeek: number;
    pendingAssignedToMe: number;
  };
};

export function DashboardPage() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.roleCode);
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
    retry: 1,
  });

  if (isLoading && !data) {
    return <DashboardSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="space-y-8">
        <PageHeader title={t('dashboard.overviewTitle')} description={t('dashboard.overviewSubtitle')} />
        <Card className="border-destructive/35 bg-destructive/[0.04] p-6 shadow-card dark:shadow-none">
          <CardTitle className="text-base">{t('dashboard.errorLoad')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.retry')}</CardDescription>
          <Button type="button" className="mt-4" variant="outline" onClick={() => void refetch()}>
            {t('dashboard.retry')}
          </Button>
        </Card>
      </div>
    );
  }

  if (role === 'DELIVERY') {
    return (
      <div className="space-y-8">
        <PageHeader title={t('dashboard.deliveryWelcome')} description={t('dashboard.deliverySubtitle')} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            title={t('dashboard.statPending')}
            value={data.driver?.pendingAssignedToMe ?? 0}
            hint={t('dashboard.statPendingHint')}
          />
          <Stat
            title={t('dashboard.statToday')}
            value={data.driver?.myDeliveredThisWeek ?? 0}
            hint={t('dashboard.statTodayHint')}
          />
          <Stat
            title={t('dashboard.distDeliveredWeek')}
            value={data.distributions.deliveredThisWeek}
            hint={t('dashboard.distDeliveredWeekHint')}
          />
          <Stat
            title={t('dashboard.distPending')}
            value={data.distributions.pending}
            hint={t('dashboard.distPendingHint')}
          />
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

  const deliveredChart =
    data.aidCategories.mostDeliveredThisWeek.slice(0, 8).map((c) => ({
      name:
        c.categoryName.length > 14 ? `${c.categoryName.slice(0, 12)}…` : c.categoryName,
      qty: c.deliveredQuantity,
    })) ?? [];

  const stockChart =
    data.stock.lowStockItems.slice(0, 8).map((x) => ({
      name: x.itemName.length > 14 ? `${x.itemName.slice(0, 12)}…` : x.itemName,
      remaining: x.remaining,
    })) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader title={t('dashboard.overviewTitle')} description={t('dashboard.overviewSubtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Stat title={t('dashboard.benefActive')} value={data.beneficiaries.active} hint={t('dashboard.benefActiveHint')} />
        <Stat
          title={t('dashboard.benefInactive')}
          value={data.beneficiaries.inactive}
          hint={t('dashboard.benefInactiveHint')}
        />
        <Stat title={t('dashboard.benefTotal')} value={data.beneficiaries.total} hint={t('dashboard.benefTotalHint')} />
        <Stat
          title={t('dashboard.distDeliveredWeek')}
          value={data.distributions.deliveredThisWeek}
          hint={t('dashboard.distDeliveredWeekHint')}
        />
        <Stat
          title={t('dashboard.distPending')}
          value={data.distributions.pending}
          hint={t('dashboard.distPendingHint')}
        />
        <Stat
          title={t('dashboard.distAssigned')}
          value={data.distributions.assigned}
          hint={t('dashboard.distAssignedHint')}
        />
        <Stat title={t('dashboard.distFailed')} value={data.distributions.failed} hint={t('dashboard.distFailedHint')} />
        <Stat title={t('dashboard.stockLow')} value={data.stock.lowStockCount} hint={t('dashboard.stockLowHint')} />
        <Stat title={t('dashboard.stockOut')} value={data.stock.outOfStockCount} hint={t('dashboard.stockOutHint')} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-4 sm:p-6">
          <CardTitle>{t('dashboard.categoriesRequestedTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.categoriesRequestedDesc')}</CardDescription>
          <div className="mt-4 overflow-x-auto">
            {data.aidCategories.mostRequested.length ? (
              <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pe-3 font-medium">{t('dashboard.colCategory')}</th>
                    <th className="py-2 font-medium">{t('dashboard.colScore')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aidCategories.mostRequested.slice(0, 10).map((row) => (
                    <tr key={row.categoryId} className="border-b border-border/70">
                      <td className="py-2 pe-3 font-medium">{row.categoryName}</td>
                      <td className="py-2 tabular-nums">{row.requestScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('dashboard.emptyCategories')}</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-4 sm:p-6">
          <CardTitle>{t('dashboard.categoriesDeliveredTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('dashboard.categoriesDeliveredDesc')}</CardDescription>
          <div className="mt-4 overflow-x-auto">
            {data.aidCategories.mostDeliveredThisWeek.length ? (
              <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pe-3 font-medium">{t('dashboard.colCategory')}</th>
                    <th className="py-2 font-medium">{t('dashboard.colDelivered')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aidCategories.mostDeliveredThisWeek.slice(0, 10).map((row) => (
                    <tr key={row.categoryId} className="border-b border-border/70">
                      <td className="py-2 pe-3 font-medium">{row.categoryName}</td>
                      <td className="py-2 tabular-nums">{row.deliveredQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('dashboard.emptyCategories')}</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <CardTitle>{t('dashboard.chartDeliveredWeek')}</CardTitle>
          <div className="mt-4 h-56 w-full min-h-56 min-w-0">
            {deliveredChart.length ? (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={deliveredChart}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={56} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(199 89% 38%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('dashboard.emptyCategories')}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <CardTitle>{t('dashboard.chartStockLow')}</CardTitle>
          <div className="mt-4 h-56 w-full min-h-56 min-w-0">
            {stockChart.length ? (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={stockChart}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={56} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="remaining" fill="hsl(25 95% 42%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('dashboard.emptyStockChart')}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-4 sm:p-6">
        <CardTitle>{t('dashboard.stockTableTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('dashboard.stockTableDesc')}</CardDescription>
        <div className="mt-4 overflow-x-auto">
          {data.stock.lowStockItems.length ? (
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t('dashboard.colItem')}</th>
                  <th className="py-2 pe-3 font-medium">{t('dashboard.colCategory')}</th>
                  <th className="py-2 font-medium">{t('dashboard.colRemaining')}</th>
                  <th className="py-2 font-medium">{t('dashboard.colStockAlert')}</th>
                </tr>
              </thead>
              <tbody>
                {data.stock.lowStockItems.slice(0, 15).map((row) => (
                  <tr key={row.stockItemId} className="border-b border-border/70">
                    <td className="py-2 pe-3 font-medium">{row.itemName}</td>
                    <td className="py-2 pe-3 text-muted-foreground">{row.categoryName}</td>
                    <td className="py-2 tabular-nums">{row.remaining}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          row.outOfStock
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-amber-500/15 text-amber-950 dark:text-amber-100',
                        )}
                      >
                        {row.outOfStock ? t('dashboard.stockOut') : t('dashboard.stockLow')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('dashboard.emptyStockChart')}</p>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <CardTitle>{t('dashboard.quickTitle')}</CardTitle>
        <CardDescription className="mt-2">{t('dashboard.quickDesc')}</CardDescription>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Quick to="/app/beneficiaries" label={t('dashboard.quickBeneficiaries')} />
          <Quick to="/app/categories" label={t('dashboard.quickCategories')} />
          <Quick to="/app/stock" label={t('dashboard.quickStock')} />
          <Quick to="/app/distributions/new" label={t('dashboard.quickDistributions')} />
        </div>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-8 w-16 rounded bg-muted" />
            <div className="mt-2 h-3 w-full max-w-[12rem] rounded bg-muted" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="h-48 p-4 sm:p-6">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-4 h-32 rounded-md bg-muted/70" />
        </Card>
        <Card className="h-48 p-4 sm:p-6">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-4 h-32 rounded-md bg-muted/70" />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-64 p-4">
          <div className="h-5 w-48 rounded bg-muted" />
          <div className="mt-6 h-44 rounded-md bg-muted/70" />
        </Card>
        <Card className="h-64 p-4">
          <div className="h-5 w-48 rounded bg-muted" />
          <div className="mt-6 h-44 rounded-md bg-muted/70" />
        </Card>
      </div>
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return (
    <Card className="border-border/60 p-5 shadow-card dark:border-border dark:shadow-none">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      {hint ? <div className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function Quick({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border/70 bg-muted/35 px-4 py-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {label}
    </Link>
  );
}
