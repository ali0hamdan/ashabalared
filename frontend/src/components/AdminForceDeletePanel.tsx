import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { DeleteBlockedPayload } from '@/lib/deleteBlocked';
import type { TFunction } from 'i18next';

type Props = {
  t: TFunction;
  blocked: DeleteBlockedPayload;
  confirmValue: string;
  onConfirmChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  selfUsernameConfirm?: string;
  onSelfUsernameChange?: (v: string) => void;
  showSelfUsername?: boolean;
};

export function AdminForceDeletePanel({
  t,
  blocked,
  confirmValue,
  onConfirmChange,
  reason,
  onReasonChange,
  selfUsernameConfirm,
  onSelfUsernameChange,
  showSelfUsername,
}: Props) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{blocked.message}</p>
      <div>
        <div className="font-medium">{t('adminOverride.blockedRelations')}</div>
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          {blocked.blockingRelations.map((rel) => (
            <li key={rel}>{t(`adminOverride.relations.${rel}`, { defaultValue: rel })}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <Label>{t('adminOverride.typeDelete')}</Label>
        <Input value={confirmValue} onChange={(e) => onConfirmChange(e.target.value)} autoComplete="off" placeholder="DELETE" />
      </div>
      {showSelfUsername ? (
        <div className="space-y-2">
          <Label>{t('adminOverride.selfUsername')}</Label>
          <Input value={selfUsernameConfirm ?? ''} onChange={(e) => onSelfUsernameChange?.(e.target.value)} autoComplete="off" />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>{t('adminOverride.reason')}</Label>
        <Input value={reason} onChange={(e) => onReasonChange(e.target.value)} maxLength={500} />
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400">{t('adminOverride.warning')}</p>
    </div>
  );
}
