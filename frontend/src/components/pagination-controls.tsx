import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type PaginationControlsProps = {
  summary: ReactNode;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  /** Disables prev/next and shows spinner while a fetch is in flight */
  isFetching?: boolean;
  className?: string;
};

export function PaginationControls({
  summary,
  page,
  totalPages,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  isFetching,
  className,
}: PaginationControlsProps) {
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  const disablePrev = atFirst || Boolean(isFetching);
  const disableNext = atLast || Boolean(isFetching);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground',
        className,
      )}
      aria-busy={isFetching ? true : undefined}
    >
      <span className="flex min-h-6 flex-wrap items-center gap-2 text-muted-foreground">
        {summary}
        {isFetching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-9 min-w-[5.5rem] rounded-lg px-3 text-xs" disabled={disablePrev} onClick={() => onPrev()}>
          {prevLabel}
        </Button>
        <Button type="button" variant="outline" className="h-9 min-w-[5.5rem] rounded-lg px-3 text-xs" disabled={disableNext} onClick={() => onNext()}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
