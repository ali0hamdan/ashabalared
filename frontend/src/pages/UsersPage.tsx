import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import { parseDeleteBlocked, type DeleteBlockedPayload } from '@/lib/deleteBlocked';
import { AdminForceDeletePanel } from '@/components/AdminForceDeletePanel';
import type { UserRow } from '@/types/api-shapes';

function userDeleteErrorMessage(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(m)) return m.filter(Boolean).join(' ');
  if (typeof m === 'string' && m.trim()) return m.trim();
  return fallback;
}

export function UsersPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<UserRow[]>('/users')).data,
  });
  const rows = useMemo((): UserRow[] => (Array.isArray(data) ? data : []), [data]);

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleCode, setRoleCode] = useState<'ADMIN' | 'DELIVERY'>('DELIVERY');

  const [delUser, setDelUser] = useState<UserRow | null>(null);
  const [delUserLoading, setDelUserLoading] = useState(false);
  const [forceUser, setForceUser] = useState<{ row: UserRow; blocked: DeleteBlockedPayload; self: boolean } | null>(null);
  const [forceUserConfirm, setForceUserConfirm] = useState('');
  const [forceUserReason, setForceUserReason] = useState('');
  const [forceUserSelfName, setForceUserSelfName] = useState('');
  const [forceUserPending, setForceUserPending] = useState(false);

  async function create() {
    try {
      await api.post('/users', { username, password, displayName, roleCode });
      toast.success(t('users.createSuccess'));
      setOpen(false);
      setUsername('');
      setPassword('');
      setDisplayName('');
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch {
      toast.error(t('common.createError'));
    }
  }

  async function reset(id: string) {
    try {
      const { data: res } = await api.post(`/users/${id}/reset-password`, {});
      toast.success(t('users.resetSuccess', { password: res.temporaryPassword }));
    } catch {
      toast.error(t('common.resetError'));
    }
  }

  async function confirmDeleteUser() {
    if (!delUser) return;
    setDelUserLoading(true);
    try {
      await api.delete(`/users/${delUser.id}`);
      toast.success(t('users.deleteSuccess'));
      setDelUser(null);
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: unknown) {
      const blocked = parseDeleteBlocked(e);
      if (blocked) {
        if (blocked.blockingRelations?.includes('superAdminAccount') && me?.roleCode !== 'SUPER_ADMIN') {
          toast.error(blocked.message);
          setDelUser(null);
        } else {
          setForceUser({ row: delUser, blocked, self: delUser.id === me?.id });
          setDelUser(null);
          setForceUserConfirm('');
          setForceUserReason('');
          setForceUserSelfName('');
        }
      } else {
        toast.error(userDeleteErrorMessage(e, t('common.updateError')));
        setDelUser(null);
      }
    } finally {
      setDelUserLoading(false);
    }
  }

  async function confirmForceDeleteUser() {
    if (!forceUser) return;
    if (forceUserConfirm.trim() !== 'DELETE') {
      toast.error(t('adminOverride.mustTypeDelete'));
      return;
    }
    if (forceUser.self) {
      const ok = forceUserSelfName.trim().toLowerCase() === (me?.username ?? '').trim().toLowerCase();
      if (!ok) {
        toast.error(t('adminOverride.selfUsernameMismatch'));
        return;
      }
    }
    setForceUserPending(true);
    try {
      await api.post(`/users/${forceUser.row.id}/force-delete`, {
        confirmationText: forceUserConfirm.trim(),
        reason: forceUserReason.trim() || undefined,
        selfUsernameConfirm: forceUser.self ? forceUserSelfName.trim() : undefined,
      });
      toast.success(t('users.deleteSuccess'));
      setForceUser(null);
      setForceUserConfirm('');
      setForceUserReason('');
      setForceUserSelfName('');
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: unknown) {
      const blocked = parseDeleteBlocked(e);
      if (blocked) {
        toast.error(blocked.message);
      } else {
        toast.error(userDeleteErrorMessage(e, t('common.updateError')));
      }
    } finally {
      setForceUserPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          {t('users.newUser')}
        </Button>
      </div>

      <Card className="max-w-full overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-start">
              <tr className="border-b border-border">
                <th className="p-3">{t('users.colDisplay')}</th>
                <th className="p-3">{t('users.colUsername')}</th>
                <th className="p-3">{t('users.colRole')}</th>
                <th className="p-3">{t('users.colStatus')}</th>
                <th className="p-3">{t('users.colAction')}</th>
                <th className="p-3">{t('users.colDelete')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/20">
                  <td className="p-3 font-medium">{u.displayName}</td>
                  <td className="p-3">{u.username}</td>
                  <td className="p-3">{u.role?.code}</td>
                  <td className="p-3">
                    {u.isActive ? <Badge variant="success">{t('users.active')}</Badge> : <Badge variant="danger">{t('users.inactive')}</Badge>}
                  </td>
                  <td className="p-3">
                    <Button className="h-9 px-3 text-xs" variant="outline" type="button" onClick={() => void reset(u.id)}>
                      {t('users.resetPassword')}
                    </Button>
                  </td>
                  <td className="p-3">
                    <Button className="h-9 px-3 text-xs" variant="outline" type="button" onClick={() => setDelUser(u)}>
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('users.dialogTitle')}
        description={t('users.dialogDesc')}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void create()}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>{t('users.labelUsername')}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('users.labelDisplay')}</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('users.labelPassword')}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('users.labelRole')}</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value as 'ADMIN' | 'DELIVERY')}
            >
              <option value="ADMIN">{t('users.roleAdmin')}</option>
              <option value="DELIVERY">{t('users.roleDelivery')}</option>
            </select>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(delUser)}
        onClose={() => setDelUser(null)}
        title={t('users.deleteTitle')}
        description={delUser ? `${delUser.displayName} (${delUser.username})` : ''}
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDelUser(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={delUserLoading} onClick={() => void confirmDeleteUser()}>
              {delUserLoading ? t('common.saving') : t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('users.deleteDesc')}</p>
      </Dialog>

      <Dialog
        open={Boolean(forceUser)}
        onClose={() => {
          setForceUser(null);
          setForceUserConfirm('');
          setForceUserReason('');
          setForceUserSelfName('');
        }}
        title={t('users.forceDeleteTitle')}
        description={forceUser ? `${forceUser.row.displayName} (${forceUser.row.username})` : ''}
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setForceUser(null);
                setForceUserConfirm('');
                setForceUserReason('');
                setForceUserSelfName('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" disabled={forceUserPending} onClick={() => void confirmForceDeleteUser()}>
              {forceUserPending ? t('common.saving') : t('adminOverride.forceDelete')}
            </Button>
          </>
        }
      >
        {forceUser ? (
          <AdminForceDeletePanel
            t={t}
            blocked={forceUser.blocked}
            confirmValue={forceUserConfirm}
            onConfirmChange={setForceUserConfirm}
            reason={forceUserReason}
            onReasonChange={setForceUserReason}
            showSelfUsername={forceUser.self}
            selfUsernameConfirm={forceUserSelfName}
            onSelfUsernameChange={setForceUserSelfName}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
