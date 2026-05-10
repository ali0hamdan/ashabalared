import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-14 text-center',
        className,
      )}
    >
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
