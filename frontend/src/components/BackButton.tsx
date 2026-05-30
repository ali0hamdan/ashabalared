import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

const DEFAULT_FALLBACK = '/app/dashboard';

type BackButtonProps = {
  /** Route when there is no in-app history to go back to. */
  fallbackPath?: string;
  /** Visible label next to the arrow. */
  label?: string;
  className?: string;
  /** When false, only the arrow is shown (still has aria-label). */
  showLabel?: boolean;
};

function canNavigateBack(): boolean {
  const state = window.history.state as { idx?: number } | null;
  if (typeof state?.idx === 'number' && state.idx > 0) {
    return true;
  }
  return window.history.length > 1;
}

export function BackButton({
  fallbackPath = DEFAULT_FALLBACK,
  label,
  className,
  showLabel = true,
}: BackButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const text = label ?? t('common.back');

  if (location.pathname === '/app/dashboard') {
    return null;
  }

  const handleBack = () => {
    if (canNavigateBack()) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={cn('h-9 shrink-0 gap-1.5 px-2.5', className)}
      onClick={handleBack}
      aria-label={text}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      {showLabel ? <span className="text-sm">{text}</span> : null}
    </Button>
  );
}
