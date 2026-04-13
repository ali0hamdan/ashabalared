import { useAuthStore } from '@/store/auth';
import type { RoleCode } from '@/types';
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';

type Props = { allow: RoleCode[]; children: ReactElement };

export function RequireRole({ allow, children }: Props) {
  const role = useAuthStore((s) => s.user?.roleCode);
  if (!role || !allow.includes(role)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}
