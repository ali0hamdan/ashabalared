import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { AuthUser } from '@/types';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<{ accessToken: string; user: AuthUser; mustChangePassword?: boolean }>(
        '/auth/login',
        { username, password },
      );
      setSession(data.accessToken, data.user);
      toast.success(t('login.success'));
      if (data.mustChangePassword) navigate('/app/profile', { replace: true });
      else navigate('/app/dashboard', { replace: true });
    } catch {
      toast.error(t('login.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-background to-slate-100/90 p-4 pt-16 dark:from-slate-950 dark:via-background dark:to-slate-900 sm:pt-4">
      <div className="absolute end-3 top-3 z-10 flex items-center gap-2 sm:end-4 sm:top-4">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <Card className="w-full min-w-0 max-w-md border-border/60 shadow-card">
        <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
        <CardDescription className="mt-2">{t('login.subtitle')}</CardDescription>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">{t('login.username')}</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
