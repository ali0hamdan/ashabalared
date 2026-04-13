import axios from 'axios';
import { useAuthStore, getAccessTokenForApi } from '@/store/auth';
import type { AuthUser } from '@/types';

/** Single source of truth for API origin (Vite injects at build time). No trailing slash. */
function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  const base = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
  if (!base) {
    throw new Error(
      'VITE_API_URL is not set. Add it to frontend/.env, e.g. VITE_API_URL=http://localhost:3000 (see .env.example).',
    );
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
