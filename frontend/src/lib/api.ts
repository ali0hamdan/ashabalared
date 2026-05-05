import axios from 'axios';
import { useAuthStore, getAccessTokenForApi } from '@/store/auth';
import type { AuthUser } from '@/types';

/** Single source of truth for API origin (Vite injects at build time). No trailing slash. */
function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  const base = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
  if (!base) {
    throw new Error(
      'VITE_API_URL is not set. Add it to frontend/.env (see .env.example). For production use https://…',
    );
  }
  if (import.meta.env.PROD) {
    if (base.startsWith('http://') || /\blocalhost\b/i.test(base) || /127\.0\.0\.1/.test(base)) {
      throw new Error(
        'Invalid VITE_API_URL for production build: use https and a non-localhost API origin.',
      );
    }
    if (!base.startsWith('https://')) {
      throw new Error('Invalid VITE_API_URL for production build: URL must start with https://');
    }
  }
  return base;
}

const API_BASE = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessTokenForApi();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<void> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (!original) return Promise.reject(error);
    const url = String(original.url ?? '');
    if (error.response?.status !== 401 || original._retry || url.includes('/auth/login')) {
      return Promise.reject(error);
    }
    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = axios
        .post<{ accessToken: string; user: unknown }>(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        .then((res) => {
          useAuthStore.getState().setAccessToken(res.data.accessToken);
          if (res.data.user) useAuthStore.getState().setUser(res.data.user as AuthUser);
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    try {
      await refreshPromise;
      return api(original);
    } catch (e) {
      useAuthStore.getState().clear();
      return Promise.reject(e);
    }
  },
);
