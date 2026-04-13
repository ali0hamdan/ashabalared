import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success(t('common.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      clear();
      navigate('/login', { replace: true });
    } catch {
      toast.error(t('common.passwordChangeError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
        <p className="break-words text-sm text-muted-foreground">
          {user?.displayName} — {user?.username} — {user?.roleCode}
        </p>
      </div>

      <Card className="space-y-4">
        <CardTitle>{t('profile.changePasswordTitle')}</CardTitle>
        <CardDescription>{t('profile.changePasswordDesc')}</CardDescription>
        <div className="grid gap-3 md:max-w-md">
          <div className="space-y-2">
            <Label>{t('profile.currentPassword')}</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('profile.newPassword')}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <Button type="button" disabled={loading} onClick={() => void submit()}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
