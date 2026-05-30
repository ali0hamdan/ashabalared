import { BackButton } from '@/components/BackButton';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Show back navigation (default true). Set false on dashboard home. */
  showBack?: boolean;
  backFallbackPath?: string;
};

/** Consistent page title row: back + heading + optional subtitle + optional actions (right on md+). */
export function PageHeader({
  title,
  description,
  actions,
  className,
  showBack = true,
  backFallbackPath,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-border/60 pb-6 md:flex-row md:items-start md:justify-between md:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {showBack ? <BackButton fallbackPath={backFallbackPath} className="mt-0.5 self-start" /> : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[1.65rem]">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
