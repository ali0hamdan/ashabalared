import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

export function DistributionStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `status.dist.${status}` as const;
  const label = t(key, { defaultValue: status });
  const variant =
    status === 'DELIVERED'
      ? ('success' as const)
      : status === 'CANCELLED'
        ? ('danger' as const)
        : status === 'PENDING'
          ? ('warning' as const)
          : ('info' as const);
  return <Badge variant={variant}>{label}</Badge>;
}

export function BeneficiaryStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `status.ben.${status}` as const;
  const label = t(key, { defaultValue: status });
  const variant =
    status === 'ACTIVE' ? ('success' as const) : status === 'INACTIVE' ? ('warning' as const) : ('default' as const);
  return <Badge variant={variant}>{label}</Badge>;
}
