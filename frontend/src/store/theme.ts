import { create } from 'zustand';

const STORAGE_KEY = 'relief-theme';
export type ThemeMode = 'light' | 'dark';

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

function write(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

/** Call once at app startup (after DOM is available). */
export function initTheme() {
  if (typeof document === 'undefined') return;
  applyTheme(read());
}

export const useThemeStore = create<{
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}>((set, get) => ({
  mode: typeof window !== 'undefined' ? read() : 'light',
  setMode: (m) => {
    write(m);
    applyTheme(m);
    set({ mode: m });
  },
  toggle: () => {
    const next = get().mode === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
}));
