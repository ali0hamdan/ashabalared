import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type DataTableShellProps = {
  children: ReactNode;
  /** Sticky pagination / summary row below the scroll area */
  footer?: ReactNode;
  className?: string;
  /** Extra classes on inner scroll container */
  innerClassName?: string;
};

/** Rounded shell + horizontal scroll for wide operational tables. */
export function DataTableShell({ children, footer, className, innerClassName }: DataTableShellProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/70 bg-card shadow-card dark:shadow-none',
        className,
      )}
    >
      <div className={cn('overflow-x-auto', innerClassName)}>{children}</div>
      {footer ? <div className="border-t border-border/60 bg-muted/25">{footer}</div> : null}
    </div>
  );
}
