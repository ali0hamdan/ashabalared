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
  Shield,
  FileText,
  User,
  X,
  History,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
    }
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
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{t('brand.sidebar')}</div>
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={() => {
              if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
            }}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )
            }
          >
            <it.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{t(it.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <Button variant="outline" className="w-full" onClick={() => void logout()}>
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">{t('auth.logout')}</span>
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen min-w-0 bg-muted/40">
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
          'print:hidden fixed start-0 top-0 z-50 flex h-full w-[min(100vw,16rem)] flex-col border-e border-border bg-card shadow-lg transition-transform duration-200 ease-out md:z-40 md:w-64 md:shadow-sm',
          sidebarOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          !sidebarOpen && 'pointer-events-none',
        )}
      >
        {sidebarBody}
      </aside>

      <div className={cn('min-w-0 transition-[margin] duration-200 ease-out', sidebarOpen && 'md:ms-64')}>
        <header className="print:hidden sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-4">
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
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t('brand.header')}</div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground sm:inline">
              {user?.roleCode}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl min-w-0 p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
