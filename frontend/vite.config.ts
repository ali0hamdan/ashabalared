import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (command === 'build' && mode === 'production') {
    const url = (env.VITE_API_URL ?? '').trim();
    if (
      !url ||
      url.startsWith('http://') ||
      /\blocalhost\b/i.test(url) ||
      /127\.0\.0\.1/.test(url)
    ) {
      throw new Error(
        'Production build: set VITE_API_URL to an https:// API origin (no http://, localhost, or 127.0.0.1). ' +
          'Set it in Railway or frontend/.env.production.',
      );
    }
    if (!url.startsWith('https://')) {
      throw new Error(
        'Production build: VITE_API_URL must start with https:// (got: ' + url + ').',
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), './src') },
    },
    server: {
      port: 5173,
    },
  };
});
