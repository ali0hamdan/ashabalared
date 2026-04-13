# Production deployment

Split hosting is supported: static frontend (Vercel / Netlify), Nest API (Railway / Render / VPS), PostgreSQL (Neon / Supabase / Railway / any managed Postgres).

## Environment variables

### Backend (`backend/.env` on the host)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL (`postgresql://…`). Use the provider’s **direct** URL for migrations; **pooled** URL is fine at runtime if the provider documents Prisma compatibility (e.g. `?pgbouncer=true` on Neon). |
| `JWT_ACCESS_SECRET` | Yes | Long random string for signing access JWTs. |
| `JWT_REFRESH_SECRET` | Yes | Long random string (used if you extend refresh signing; access secret is primary for JWT module today). |
| `JWT_ACCESS_EXPIRES` | No | Default `15m`. |
| `JWT_REFRESH_EXPIRES_DAYS` | No | Default `7` (used by auth service for refresh token expiry). |
| `PORT` | No | Default `3000` (local dev; set explicitly in production). |
| `NODE_ENV` | Yes in prod | Set to `production`. |
| `CORS_ORIGIN` | Yes in prod | Comma-separated list of **exact** frontend origins, e.g. `https://myapp.vercel.app`. Must match the browser origin or credentialed requests will fail. |
| `TRUST_PROXY` | If behind reverse proxy | Set to `1` or `true` when TLS terminates before Node (Railway, Render, nginx) so `req.ip` and `secure` cookies behave correctly. |

Never commit real `.env` files. Copy from `backend/.env.example` and set secrets in the host’s secret manager.

### Frontend (`frontend` build-time on Vercel / Netlify)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Public API base URL, e.g. `https://api.yourdomain.com` (no trailing slash). |

## Database

1. Create an empty database (or use a new branch / database in Neon).
2. Set `DATABASE_URL` on the machine that runs migrations.
3. From `backend/`:

```bash
npm ci
npm run prisma:migrate:deploy
npm run prisma:seed
```

For **first** local setup with an empty DB you can instead use:

```bash
npx prisma migrate dev
```

which applies existing migrations and can create new ones in development.

## Backend (Railway / Render / VPS)

1. Repository root or `backend` as project root depending on the platform.
2. **Build command** (example): from `backend/`, run `npm ci` then `npm run build` (or one line in **cmd.exe** / Git Bash: `cd backend && npm ci && npm run build`).
3. **Start command**: from `backend/`, run `npm run start:prod`
4. Set all backend env vars including `NODE_ENV=production` and `CORS_ORIGIN` to your frontend URL(s).
5. If the platform terminates TLS in front of Node, set `TRUST_PROXY=1`.
6. Refresh cookies use `secure: true` in production (`auth.controller.ts`); the site must be served over **HTTPS**.

### Cross-origin cookies (frontend and API on different domains)

Browsers send HttpOnly refresh cookies only to the API origin. The frontend already calls the API with `withCredentials: true` for refresh. Ensure:

- `CORS_ORIGIN` includes the exact frontend origin.
- `enableCors({ credentials: true })` remains enabled (already in `main.ts`).

If cookies still do not persist across subdomains, consider placing API and app under one registrable domain (e.g. `app.example.com` and `api.example.com`) and adjusting cookie `domain` in code only if you have a clear requirement (not enabled by default).

## Frontend (Vercel / Netlify)

1. **Build command**: from `frontend/`, run `npm ci` then `npm run build` (or `cd frontend && npm ci && npm run build` in cmd.exe / Git Bash).
2. **Output directory**: `frontend/dist` (or `dist` if project root is `frontend`).
3. Set `VITE_API_URL` to the public backend URL.

## Managed PostgreSQL notes

- **Neon / Supabase**: copy the connection string from the dashboard; enable `sslmode=require` if offered as query params.
- **Migrations with PgBouncer**: use a **non-pooled** direct connection for `prisma migrate deploy`, or use provider guidance for Prisma Migrate + pooler.

## Health check

`GET /health` (if exposed by `AppController`) can be used as a load balancer health endpoint.
