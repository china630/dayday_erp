# DayDay / ERA ERP — production deployment (Ubuntu 24.04 + Docker Compose)

Russian version: [deploy.ru.md](./deploy.ru.md).

This guide is for the server owner: deploy the stack defined in `docker-compose.prod.yml` (Postgres, Redis, NestJS API, Next.js web).

## 1. Connect over SSH

From your workstation (replace placeholders):

```bash
ssh -i /path/to/key.pem deploy@YOUR_SERVER_IP
```

Or with password authentication (less secure):

```bash
ssh deploy@YOUR_SERVER_IP
```

## 2. Install Docker on a clean Ubuntu 24.04

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-noble}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in (or `newgrp docker`) so group membership applies. Verify:

```bash
docker version
docker compose version
```

## 3. Install Git

```bash
sudo apt-get install -y git
```

## 4. Clone the repository

```bash
sudo mkdir -p /opt/dayday_erp
sudo chown "$USER":"$USER" /opt/dayday_erp
cd /opt/dayday_erp
git clone YOUR_GIT_URL .
```

Replace `YOUR_GIT_URL` with your remote (HTTPS or SSH), e.g. `https://github.com/<org>/<repo>.git` or `git@github.com:<org>/<repo>.git`.

## 5. Environment file (`.env`)

In the repository root:

```bash
cp .env.example .env
nano .env
```

### Required and strongly recommended

| Variable / topic | Notes |
|------------------|--------|
| `POSTGRES_PASSWORD` | **Required** by `docker-compose.prod.yml` (Compose will refuse to start without it). |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Strong random values; never reuse dev secrets. |
| `NODE_ENV` | Set to `production` for both API and web (Compose also sets this for app services). |

### URLs and ports (Compose)

- **Web (host → container):** `PORT` — maps host port to container port `3000` (default `3000`). Example: `PORT=80` publishes the UI on port 80.
- **API (host → container):** `API_PUBLISH_PORT` (default `4000`) → `API_PORT` (default `4000`) inside the API container.
- **Postgres / Redis publish:** `POSTGRES_PUBLISH_PORT` (default `5432`), `REDIS_PUBLISH_PORT` (default `6379`). Omit publishing on a locked-down server by editing the compose file if you only need internal access.

### Application wiring

- **`DATABASE_URL` in `.env`:** Compose **overrides** `DATABASE_URL` for the `api` service with a URL that points at the `db` service. You do not need to hand-edit it for the default layout.
- **`REDIS_URL`:** Compose sets `redis://redis:6379` for `api`.
- **`NEXT_PUBLIC_API_URL`:** Default in Compose is `http://api:4000` so the Next.js server can reach the API inside the Docker network (rewrites and server-side fetches). The browser uses same-origin `/api/...` through Next; change this only if you understand server-side vs client-side URLs.
- **`CORS_ORIGINS`:** In production the API allows origins from this comma-separated list (plus localhost defaults). Set your public site origin(s), e.g. `https://erp.example.com`.

### Emergency module bypass (`EMERGENCY_MODULE_ACCESS_EMAIL`)

There is **no** production env var that toggles this in the current codebase. Access bypass for a fixed dev email is **disabled when `NODE_ENV=production`** (see `apps/api/src/subscription/subscription-access.service.ts`). For production you must:

- Keep **`NODE_ENV=production`** for the API.
- Avoid running the stack with `NODE_ENV=development` on a public server.

## 6. Database migrations (before or right after first API start)

The API image does not ship the Prisma CLI. Apply migrations once the `db` service is healthy, from the repo on the server.

Use a **fixed Compose project name** so the default bridge network is predictable (`${COMPOSE_PROJECT_NAME}_default`):

```bash
cd /opt/dayday_erp
export COMPOSE_PROJECT_NAME=dayday_prod
set -a && source .env && set +a

docker compose -f docker-compose.prod.yml up -d db
# When `docker compose ps` shows db as healthy:

docker run --rm \
  --network "${COMPOSE_PROJECT_NAME}_default" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-dayday}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-dayday}" \
  -v "$(pwd)/packages/database/prisma:/prisma" \
  -w /prisma \
  node:20-alpine \
  sh -c "npx --yes prisma@6.19.3 migrate deploy"
```

Adjust `POSTGRES_*` if you changed them in `.env`. Alternatively run `npm run db:migrate:deploy` from a trusted machine with a `DATABASE_URL` that reaches Postgres (VPN/SSH tunnel).

## 7. Platform reference data → SQL dump (mandatory script workflow)

Postgres executes scripts under `packages/database/prisma/docker-init/` **only the first time** the data directory is created. If the Docker volume already exists, **pulling a newer `01-seed-data.sql` from Git does not re-run those scripts** — the live database will not pick up new translations, `system_config`, or pricing rows by itself.

**Release rule:** whenever you change platform-wide data in a real database (i18n overrides, billing/pricing, quotas, CBAR-related config in `system_config`, etc.), you **must** export that state into the repo using the monorepo script, then **commit** the updated SQL so installs and manual apply steps stay in sync.

From the **repository root**, with root `.env` containing a working `DATABASE_URL` pointed at the database that has the desired content:

```bash
npm run db:dump-to-prod
```

This overwrites `packages/database/prisma/docker-init/01-seed-data.sql` with idempotent `INSERT … ON CONFLICT` for:

- `translation_overrides` (with safe filtering of invalid single-segment keys),
- `system_config`,
- `pricing_modules`, `pricing`, `pricing_bundles`.

Super-admin bootstrap remains in **`02-super-admin-seed.sql`** (that file is **not** generated by the export; the exporter does not overwrite platform user passwords by default).

**Alternatives:** `dotenv -e .env -- npm run docker-init:export -w @dayday/database` (same script). To print SQL to stdout instead of writing the file: `DOCKER_INIT_OUT=-` before the command.

**Existing production server:** after `git pull`, apply the new dump (or selected sections) with `psql` inside the `db` container if the data volume was already initialized — otherwise new rows never appear in the running instance.

## 8. Build and start the full stack

From the repository root (where `docker-compose.prod.yml` lives). Use the same `COMPOSE_PROJECT_NAME` as in the migration step if you set one:

```bash
export COMPOSE_PROJECT_NAME=dayday_prod   # optional but recommended
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api web
```

## 9. HTTPS and reverse proxy (recommended)

For public deployments, terminate TLS on **nginx** or **Caddy** in front of the `web` (and optionally `api`) ports. Restrict published Postgres/Redis ports (`POSTGRES_PUBLISH_PORT` / `REDIS_PUBLISH_PORT`) or remove those mappings entirely if only containers need them.

## 10. Troubleshooting

- **Compose interpolation:** Special characters in `POSTGRES_PASSWORD` can break the interpolated `DATABASE_URL`. Use a URL-safe password or percent-encode characters in the connection string you pass to migrations.
- **`npm ci` in Docker:** The build must use the committed `package-lock.json` from the repo root. Regenerate the lockfile locally if installs fail inside the image build.
