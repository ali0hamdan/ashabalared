import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/store/theme';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ThemeToggle() {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = mode === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 w-9 shrink-0 p-0"
      aria-label={isDark ? t('common.themeLight') : t('common.themeDark')}
      title={isDark ? t('common.themeLight') : t('common.themeDark')}
      onClick={() => toggle()}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
