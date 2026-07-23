# Sherset — VPS deploy (sherset.biznesjon.uz)

Reverse-proxy stack: **nginx → PM2 (Next.js web + NestJS api) → PostgreSQL**.
Additive: nothing here touches other sites already on the VPS.

| Component | Value |
|-----------|-------|
| Domain    | `sherset.biznesjon.uz` |
| App root  | `/var/www/sherset` |
| Web port  | `127.0.0.1:4002` (Next.js `start`) |
| API port  | `127.0.0.1:4000` (NestJS, routes under `/api/v1`) |
| Node / pnpm | `20.11.0` / `pnpm@10.33.0` |
| DB        | PostgreSQL (`sherset` database) |

Files: `deploy/nginx-sherset.biznesjon.uz.conf`, `deploy/ecosystem.sherset.config.cjs`,
`deploy/.env.production.example`.

---

## 0. Prerequisites (once per VPS)

```bash
# Node 20.11 (nvm) + pnpm + pm2 + nginx + postgres + certbot
nvm install 20.11.0 && nvm use 20.11.0
npm i -g pnpm@10.33.0 pm2
sudo apt update && sudo apt install -y nginx postgresql certbot python3-certbot-nginx
```

DNS: point an **A record** `sherset.biznesjon.uz → <VPS IP>` before running certbot.

## 1. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER sherset WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE sherset OWNER sherset;
CREATE DATABASE sherset_shadow OWNER sherset;
SQL
```

## 2. Code + env

```bash
sudo mkdir -p /var/www/sherset && sudo chown -R $USER /var/www/sherset
git clone git@github.com:Kamolov-Namoz/Sherset.git /var/www/sherset
cd /var/www/sherset

# Shared secret file (fill in real values — see the template's comments)
cp deploy/.env.production.example /var/www/sherset/.env
nano /var/www/sherset/.env          # DB url + `openssl rand -hex 32` secrets
ln -sf /var/www/sherset/.env apps/api/.env
ln -sf /var/www/sherset/.env apps/web/.env
ln -sf /var/www/sherset/.env packages/db/.env
```

## 3. Install, migrate, build

```bash
pnpm install --frozen-lockfile
pnpm --filter @moysklad/db exec prisma migrate deploy   # apply migrations (no shadow DB needed)
pnpm --filter @moysklad/db exec prisma generate
pnpm db:seed                                            # optional: seed admin (login: admin / admin123)
pnpm build:web                                          # NEXT_PUBLIC_* baked in here → env must be set first
```

> The API runs source-direct via `tsx` (no build step). Only the web app is built.

## 4. PM2

```bash
sudo mkdir -p /var/log/sherset && sudo chown -R $USER /var/log/sherset
pm2 start deploy/ecosystem.sherset.config.cjs
pm2 save
pm2 startup            # run the command it prints, so PM2 survives reboot
pm2 status             # sherset-api + sherset-web should be "online"
```

Sanity check (loopback, before nginx):
```bash
curl -sS http://127.0.0.1:4000/api/v1/health || echo "api not up"
curl -sSI http://127.0.0.1:4002 | head -1
```

## 5. nginx + TLS

```bash
sudo cp deploy/nginx-sherset.biznesjon.uz.conf /etc/nginx/sites-available/sherset.biznesjon.uz
sudo ln -s /etc/nginx/sites-available/sherset.biznesjon.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue + auto-install the Let's Encrypt cert (adds the listen 443 block)
sudo certbot --nginx -d sherset.biznesjon.uz
sudo nginx -t && sudo systemctl reload nginx
```

Certbot auto-renew is installed as a systemd timer; verify with
`sudo certbot renew --dry-run`.

## 6. Verify

Open `https://sherset.biznesjon.uz` → login page → **admin / admin123** (if seeded).

## Updates (redeploy) — use the SMART script (2026-07-23 slow-deploy fix)

The old "always `git pull` + `pnpm install` + `next build` + `migrate`" sequence ran the ~10-min-plus (much more
under this box's CPU contention) `next build` on **every** deploy — even backend-only or tiny changes. That is the
"deploy takes 1–2 hours" problem. Instead, run the diff-aware script — it does ONLY what actually changed:

```bash
# FE build can exceed the ~580s SSH timeout, so run detached + poll the log:
nohup bash /var/www/sherset/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &
tail -f /tmp/deploy.log   # or poll
```

`deploy-smart.sh` (inspects `git diff` between old/new HEAD):
- **backend-only change → NO build** (`apps/api` runs via tsx, source-direct) → just `pm2 restart sherset-api` → **seconds**.
- `pnpm install` **only** if `pnpm-lock.yaml` changed · `prisma migrate deploy` **only** if a new migration was added.
- FE change → `@moysklad/money` then `pnpm build:web` (incremental — `.next/cache` preserved) → `pm2 restart sherset-web`.
- Multi-tenant safe: touches ONLY `/var/www/sherset` + `sherset-api`/`sherset-web`.

`next build` itself is also lighter now: `next.config.mjs` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`
(the standalone `turbo run typecheck` + biome gates still run pre-deploy as the safety net — they MUST stay).

> The real remaining cost is the box being CPU-oversubscribed (8 PM2 apps / 6 cores). For FE deploys the durable fix is
> to **build off-box** (locally / CI) and ship the artifact — see `docs/perf/PERFORMANCE-REPORT.md`.

## Port collision

If another tenant on this VPS already uses `4000`/`4002`, pick a free pair
(e.g. `4020`/`4022`) and change it in **all three** places so they agree:
`ecosystem.sherset.config.cjs` (web `-p`, api `API_PORT`), the nginx
`upstream` blocks, and `.env` (`API_ORIGIN`, `API_PORT`).
