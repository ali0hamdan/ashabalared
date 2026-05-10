import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

const variants: Record<string, string> = {
  default:
    'bg-muted/90 text-foreground ring-1 ring-inset ring-border/60 dark:bg-muted dark:ring-border/50',
  neutral:
    'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-400/15 dark:bg-slate-800/90 dark:text-slate-200 dark:ring-slate-500/25',
  success:
    'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/45 dark:text-emerald-50 dark:ring-emerald-500/25',
  warning:
    'bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-500/25',
  danger:
    'bg-red-50 text-red-900 ring-1 ring-inset ring-red-600/15 dark:bg-red-950/45 dark:text-red-100 dark:ring-red-500/25',
  info: 'bg-sky-50 text-sky-950 ring-1 ring-inset ring-sky-500/15 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-500/25',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-none',
        variants[variant] ?? variants.default,
        className,
      )}
      {...props}
    />
  );
}
