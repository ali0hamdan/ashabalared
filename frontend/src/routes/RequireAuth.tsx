import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function isAbortLike(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { code?: string; name?: string };
  return o.code === 'ERR_CANCELED' || o.name === 'CanceledError' || o.name === 'AbortError';
}

export function RequireAuth() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const [booting, setBooting] = useState(Boolean(accessToken && !user));
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function boot() {
      if (!accessToken) {
        setBooting(false);
        return;
      }
      if (user) {
        setBooting(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me', { signal: ac.signal });
        if (!cancelled) setUser(data);
      } catch (e: unknown) {
        if (isAbortLike(e)) return;
        if (!cancelled) clear();
      } finally {
        setBooting(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [accessToken, user, setUser, clear]);

  if (!accessToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (booting) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">{t('requireAuth.booting')}</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
