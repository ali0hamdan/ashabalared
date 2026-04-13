import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { useTranslation } from 'react-i18next';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label={t('common.close')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:p-5 sm:pb-4">
          <div className="min-w-0 flex-1 pe-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button type="button" variant="ghost" className="h-9 w-9 shrink-0 p-0" onClick={onClose} aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 sm:pt-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
