import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

const variants: Record<string, string> = {
  default: 'bg-muted text-foreground',
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  danger: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant] ?? variants.default,
        className,
      )}
      {...props}
    />
  );
}
