import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Users,
  Warehouse,
  ClipboardList,
  MapPin,
  Shield,
  FileText,
  User,
  X,
  History,
  CalendarDays,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { RoleCode } from '@/types';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type NavItem = { to: string; labelKey: string; icon: LucideIcon; roles: RoleCode[] };

function getNavItems(): NavItem[] {
  return [
    { to: '/app/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'DELIVERY'] },
    { to: '/app/beneficiaries', labelKey: 'nav.beneficiaries', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
    {
      to: '/app/beneficiaries-history',
      labelKey: 'nav.beneficiariesHistory',
      icon: History,
      roles: ['SUPER_ADMIN', 'ADMIN'],
    },
    { to: '/app/categories', labelKey: 'nav.categories', icon: Package, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { to: '/app/stock', labelKey: 'nav.stock', icon: Warehouse, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { to: '/app/distributions', labelKey: 'nav.distributions', icon: ClipboardList, roles: ['SUPER_ADMIN', 'ADMIN', 'DELIVERY'] },
    {
      to: '/app/delivery-by-area',
      labelKey: 'nav.deliveryByArea',
      icon: MapPin,
      roles: ['SUPER_ADMIN', 'ADMIN', 'DELIVERY'],
    },
    { to: '/app/weekly-tracking', labelKey: 'nav.weeklyTracking', icon: CalendarDays, roles: ['SUPER_ADMIN', 'ADMIN', 'DELIVERY'] },
    { to: '/app/users', labelKey: 'nav.users', icon: Shield, roles: ['SUPER_ADMIN'] },
    { to: '/app/audit', labelKey: 'nav.audit', icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { to: '/app/profile', labelKey: 'nav.profile', icon: User, roles: ['SUPER_ADMIN', 'ADMIN', 'DELIVERY'] },
  ];
}

export function ShellLayout() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  /** Open by default on desktop; mobile users start with drawer closed. */
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );

  const items = getNavItems().filter((n) => user && n.roles.includes(user.roleCode));

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    // Defer closing so this is not synchronous setState inside the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => setSidebarOpen(false));
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clear();
    navigate('/login', { replace: true });
    toast.message(t('auth.loggedOut'));
  }

  const sidebarBody = (
    <>
      <div className="flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-border/70 px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.09] text-primary ring-1 ring-inset ring-primary/15">
          <ClipboardList className="h-5 w-5 opacity-90" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight">{t('brand.sidebar')}</div>
          <div className="truncate text-xs text-muted-foreground">{user?.displayName}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-9 shrink-0 p-0 md:hidden"
          aria-label={t('nav.closeSidebar')}
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={() => {
              if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
            }}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/[0.09] text-primary ring-1 ring-inset ring-primary/15'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )
            }
          >
            <it.icon className="h-[1.125rem] w-[1.125rem] shrink-0 opacity-90" />
            <span className="min-w-0 truncate">{t(it.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 border-t border-border/70 p-3">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => void logout()}>
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('auth.logout')}</span>
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen min-w-0 bg-background">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label={t('nav.closeSidebar')}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          // inline-start: left in LTR (English), right in RTL (Arabic)
          'print:hidden fixed start-0 top-0 z-50 flex h-full w-[min(100vw,16rem)] flex-col border-e border-border/70 bg-card shadow-[4px_0_24px_-8px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out md:z-40 md:w-64 md:shadow-soft dark:shadow-none',
          sidebarOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          !sidebarOpen && 'pointer-events-none',
        )}
      >
        {sidebarBody}
      </aside>

      <div className={cn('min-w-0 transition-[margin] duration-200 ease-out', sidebarOpen && 'md:ms-64')}>
        <header className="print:hidden sticky top-0 z-30 flex h-[4.25rem] items-center gap-3 border-b border-border/70 bg-card/90 px-3 shadow-soft backdrop-blur-md supports-[backdrop-filter]:bg-card/75 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-10 shrink-0 p-0"
            aria-label={sidebarOpen ? t('nav.closeSidebar') : t('nav.openSidebar')}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{t('brand.header')}</div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
            <Badge variant="neutral" className="hidden max-w-[11rem] truncate font-normal sm:inline-flex">
              {user?.roleCode}
            </Badge>
          </div>
        </header>
        <main className="mx-auto max-w-7xl min-w-0 px-4 py-6 sm:px-6 sm:py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
