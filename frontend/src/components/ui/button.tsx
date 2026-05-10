import { cn } from '@/lib/utils';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'destructive';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
          'bg-primary text-primary-foreground shadow-soft hover:bg-primary/92 active:bg-primary/88',
        variant === 'outline' &&
          'border border-border/80 bg-card shadow-sm hover:bg-muted/80 hover:border-border',
        variant === 'ghost' && 'hover:bg-muted/70',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/92',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
