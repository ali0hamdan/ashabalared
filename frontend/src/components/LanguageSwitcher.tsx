import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** One-tap toggle: shows the language you will switch *to* (AR ↔ EN). */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('en') ? 'en' : 'ar';
  const label = current === 'ar' ? 'EN' : 'AR';
  const next = current === 'ar' ? 'en' : 'ar';

  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 min-w-[2.75rem] shrink-0 px-3 text-xs font-semibold tracking-wide"
      aria-label={current === 'ar' ? 'English' : 'العربية'}
      title={current === 'ar' ? 'English' : 'العربية'}
      onClick={() => void i18n.changeLanguage(next)}
    >
      {label}
    </Button>
  );
}
