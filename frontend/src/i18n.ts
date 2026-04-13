import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar/translation.json';
import en from './locales/en/translation.json';

export const LANGUAGE_STORAGE_KEY = 'app_language';

function readStoredLanguage(): string {
  if (typeof window === 'undefined') return 'ar';
  const v = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (v === 'en' || v === 'ar') return v;
  return 'ar';
}

function applyDocumentLanguage(lng: string) {
  const short = lng.startsWith('en') ? 'en' : 'ar';
  document.documentElement.lang = short;
  document.documentElement.dir = short === 'ar' ? 'rtl' : 'ltr';
}

const initialLng = readStoredLanguage();
applyDocumentLanguage(initialLng);

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: initialLng,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on('languageChanged', (lng) => {
  const short = lng.startsWith('en') ? 'en' : 'ar';
  localStorage.setItem(LANGUAGE_STORAGE_KEY, short);
  applyDocumentLanguage(lng);
});

export default i18n;
