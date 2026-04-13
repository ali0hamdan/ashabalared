import { create } from 'zustand';
import type { AuthUser } from '@/types';

/** sessionStorage key for JWT — isolated per browser tab (not shared like localStorage). */
export const AUTH_ACCESS_TOKEN_STORAGE_KEY = 'accessToken';

/** Per-tab opaque id (audit/debug); not sent to API unless you wire it later. */
const TAB_SESSION_ID_KEY = 'relief:tab-session-id';

/** Former zustand persist key; read once then remove so auth is not retained in localStorage. */
const LEGACY_PERSIST_KEY = 'relief-auth';

function migrateLegacyPersistedTokenOnce() {
  try {
    if (sessionStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY)) return;
    const raw = localStorage.getItem(LEGACY_PERSIST_KEY);
    if (!raw) return;
    const token = (JSON.parse(raw) as { state?: { accessToken?: string } })?.state?.accessToken;
    if (token) sessionStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, token);
    localStorage.removeItem(LEGACY_PERSIST_KEY);
  } catch {
    try {
      localStorage.removeItem(LEGACY_PERSIST_KEY);
    } catch {
      /* ignore */
    }
  }
}

migrateLegacyPersistedTokenOnce();

function readStoredAccessToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAccessToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(AUTH_ACCESS_TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    /* private mode / disabled storage */
  }
}

function ensureTabSessionId() {
  try {
    if (!sessionStorage.getItem(TAB_SESSION_ID_KEY)) {
      sessionStorage.setItem(TAB_SESSION_ID_KEY, crypto.randomUUID());
    }
  } catch {
    /* ignore */
  }
}

ensureTabSessionId();

/** Stable random id for this tab (sessionStorage); useful for audit/debug headers later. */
export function getTabSessionId(): string | null {
  try {
    return sessionStorage.getItem(TAB_SESSION_ID_KEY);
  } catch {
    return null;
  }
}

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: readStoredAccessToken(),
  user: null,
  setSession: (accessToken, user) => {
    writeStoredAccessToken(accessToken);
    set({ accessToken, user });
  },
  setAccessToken: (accessToken) => {
    writeStoredAccessToken(accessToken);
    set({ accessToken });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    writeStoredAccessToken(null);
    try {
      localStorage.removeItem(LEGACY_PERSIST_KEY);
    } catch {
      /* ignore */
    }
    set({ accessToken: null, user: null });
  },
}));

/**
 * Single read path for outbound API calls: prefer in-memory token (post-login / refresh) over
 * sessionStorage so we never send a stale stored token when storage write failed but Zustand updated.
 */
export function getAccessTokenForApi(): string | null {
  try {
    const mem = useAuthStore.getState().accessToken;
    if (typeof mem === 'string') {
      const t = mem.trim();
      if (t.length && t !== 'undefined' && t !== 'null') return t;
    }
    const raw = sessionStorage.getItem(AUTH_ACCESS_TOKEN_STORAGE_KEY);
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t.length && t !== 'undefined' && t !== 'null') return t;
    }
  } catch {
    /* ignore */
  }
  return null;
}
