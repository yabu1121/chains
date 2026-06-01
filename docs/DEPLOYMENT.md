# Deployment

Production deployment notes for Chains. See `backend/.env.example` and
`frontend/.env.local.example` for the full list of variables.

## Required production environment variables

### Backend (`cmd/api`)

| Variable        | Required | Notes                                                                 |
| --------------- | -------- | --------------------------------------------------------------------- |
| `APP_ENV`       | yes      | Set to `production`. If unset it is treated as production (fail-closed). |
| `JWT_SECRET`    | yes      | ≥ 32 bytes. `openssl rand -base64 48`. Boot fails if missing/short.   |
| `DATABASE_URL`  | yes      | Use `sslmode=require` (or `verify-full`).                             |
| `CORS_ORIGINS`  | yes      | Exact site origin(s), comma-separated. Never `*` in production.       |
| `REDIS_ADDR`    | yes      | Required by default (`REQUIRE_REDIS=true`) for multi-instance caches.  |
| `JWT_TTL`       | no       | Default `24h`.                                                        |
| `AUTO_MIGRATE`  | no       | Default `false` in production — run migrations separately (below).    |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | no | Set both for in-process TLS; otherwise terminate TLS upstream. |

Connection-pool (`DB_MAX_OPEN_CONNS`, …) and `CACHE_TTL` have safe defaults.

### Frontend (Next.js)

| Variable                   | Required | Notes                                                         |
| -------------------------- | -------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | yes      | Public API origin (https). Inlined into the bundle at build.  |

## Build

Container images (see `backend/Dockerfile`, `frontend/Dockerfile`):

```sh
docker build -t chains-backend ./backend
docker build -t chains-frontend ./frontend
```

## Migrations

Migrations are decoupled from API start-up. Run them as a discrete deploy step
before rolling out new API instances:

```sh
# locally
make backend-migrate
# in a container (same image as the API)
docker run --rm --env-file backend/.env --entrypoint /app/migrate chains-backend
```

## TLS

Terminate TLS at a load balancer / reverse proxy (recommended), or set
`TLS_CERT_FILE` and `TLS_KEY_FILE` to terminate in-process. `APP_ENV=production`
additionally enables HSTS on responses.
