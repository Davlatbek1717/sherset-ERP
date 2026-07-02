# Production deployment qo'llanmasi

Loyihani real production muhitiga chiqarish uchun zarur sozlamalar va qadamlar.

## Talab qilinadigan environment variables

### API server (`apps/api/.env`)

```bash
# --- Asosiy ---
NODE_ENV=production
TZ=Asia/Tashkent
API_PORT=4000
API_BASE_URL=https://api.your-domain.uz

# --- Database (PostgreSQL 16+) ---
DATABASE_URL=postgresql://user:STRONG_PASS@db-host:5432/moysklad_prod?schema=public&connection_limit=20

# --- JWT (production secret — har biri 64+ char random) ---
JWT_ACCESS_SECRET=<openssl rand -hex 64>
JWT_REFRESH_SECRET=<openssl rand -hex 64>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
PASSWORD_HASH_ROUNDS=12

# --- Cookie ---
COOKIE_SECRET=<openssl rand -hex 32>

# --- CORS ---
WEB_ORIGIN=https://app.your-domain.uz,https://your-domain.uz

# --- Observability ---
SENTRY_DSN=https://xxxxx@sentry.io/yyyyy
LOG_LEVEL=info
LOG_PRETTY=false

# --- UZ Integratsiyalar (production credentials) ---
SOLIQ_UZ_API_BASE=https://didox.uz/api
SOLIQ_UZ_API_KEY=<production didox key>
ASL_BELGISI_API_BASE=https://api.aslbelgisi.uz
ASL_BELGISI_API_KEY=<production asl belgisi key>
PAYME_MERCHANT_ID=<your payme merchant id>
PAYME_SECRET_KEY=<payme production secret>
CLICK_SERVICE_ID=<your click service id>
CLICK_MERCHANT_USER_ID=<your click merchant user id>
CLICK_SECRET_KEY=<click production secret>
ESKIZ_EMAIL=<eskiz account email>
ESKIZ_SECRET=<eskiz secret token>
CBRU_API_BASE=https://cbu.uz/ru/arkhiv-kursov-valyut/json

# --- Email SMTP (real provider — SendGrid/Mailgun/Yandex) ---
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=<sendgrid api key>
SMTP_FROM="MoySklad <noreply@your-domain.uz>"

# --- Object storage (S3 yoki MinIO) ---
S3_ENDPOINT=https://s3.amazonaws.com  # yoki MinIO endpoint
S3_REGION=us-east-1
S3_BUCKET=moysklad-prod-attachments
S3_ACCESS_KEY=<aws access key>
S3_SECRET_KEY=<aws secret key>
S3_FORCE_PATH_STYLE=false  # true MinIO uchun

# --- Feature flags ---
FEATURE_WIZARD_ONBOARDING=true
FEATURE_MARKING_ASL=true
FEATURE_SOLIQ_UZ=true
```

### Web (`apps/web/.env.production`)

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.uz
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/zzzzz  # web client DSN
```

## Deployment qadamlari

### 1. Database migratsiya

```bash
# Schema'ni production DB'ga qo'llash
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @moysklad/db exec prisma migrate deploy

# Birinchi marta — admin foydalanuvchi yaratish (production seed yo'q)
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @moysklad/db exec tsx scripts/create-admin.ts \
  --email=admin@your-domain.uz --password=<strong-password>
```

### 2. Build

```bash
pnpm install --frozen-lockfile
pnpm turbo run build
```

### 3. Health check endpoints

API quyidagilarni ta'minlaydi:
- `GET /api/v1/health` — service alive
- `GET /api/v1/health/db` — database reachable
- `GET /api/v1/health/queues` — webhook + email + sms queues healthy

Load balancer / Kubernetes liveness probe shu endpoint'larni ishlatadi.

### 4. Cron worker'lar

Quyidagi cron'lar API serverda ishlaydi (built-in @nestjs/schedule, alohida worker kerak emas):
- `WebhookDeliveryCron` — har 30 soniya
- `EmailDeliveryCron` — har 30 soniya
- `SmsDeliveryCron` — har 30 soniya
- `TelegramOutboxCron` — har 30 soniya
- `InvoiceOutOverdueCron` — har soat
- `ExchangeRateCron` — kuniga 09:00 (CBU)
- `KorzinaCron` — kuniga 03:00 (30 kunlik retention)

**Skalalashda ehtiyot:** API'ni 2+ instance bilan ishlatsangiz, cron har instance'da ishlaydi va dublikat ishlar yaratadi. Multi-instance uchun:
- Faqat bitta "leader" instance'da cron'larni yoqing (env: `ENABLE_CRONS=true`)
- Yoki Redis lock (`@nestjs/schedule` + `bull` queue) bilan distributed lock

### 5. Sentry sozlash

API:
```ts
// apps/api/src/main.ts (allaqachon kod bor, faqat DSN kerak)
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% traces
});
```

Web:
```ts
// apps/web/sentry.client.config.ts (yangi fayl yaratish kerak)
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
```

### 6. Webhook callback URL'lar

UZ integratsiyalar production'da bizga callback yuboradi. Quyidagi URL'larni tegishli kabinetlarga kiriting:

| Provayder | URL |
|---|---|
| **Payme** | `https://api.your-domain.uz/api/v1/payme` |
| **Click** | `https://api.your-domain.uz/api/v1/click` |
| **Telegram** | `https://api.your-domain.uz/api/v1/telegram-webhook/<accountId>` |
| **EDO providers** | `https://api.your-domain.uz/api/v1/edo/webhook` |

### 7. CDN va static assets

Web app Next.js bilan qurilgan. Production'da CDN orqali yetkazib berish:
- `/_next/static/*` → CDN cache (1 yil)
- `/api/*` → CDN bypass (har doim originga)

Vercel/Cloudflare/AWS CloudFront ko'rsatmalar uchun ularning hujjatlarini ko'ring.

### 8. Backup strategiyasi

**PostgreSQL:**
- Kuniga `pg_dump` (snapshot) → S3
- 30 kun saqlash
- Haftalik full backup → cold storage (Glacier)

**Object storage:**
- S3 versioning yoqilgan bo'lsin
- Cross-region replication

**Disaster recovery:** RTO < 4 soat, RPO < 24 soat.

## Mostlashtirish (production tweaks)

### PostgreSQL

```sql
-- Connection pooling
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '4GB';      -- ~25% RAM
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET work_mem = '32MB';

-- WAL
ALTER SYSTEM SET wal_buffers = '32MB';
ALTER SYSTEM SET max_wal_size = '4GB';

-- Logging
ALTER SYSTEM SET log_min_duration_statement = '500ms';  -- slow query log

SELECT pg_reload_conf();
```

### Node.js (API)

```bash
# 4 process cluster (CPU sonidan kam bo'lsin)
NODE_OPTIONS="--max-old-space-size=2048" \
PM2_INSTANCES=4 \
pm2 start dist/main.js --name moysklad-api -i 4
```

### Next.js (Web)

```bash
# Standalone build (Docker image kichikroq)
NEXT_TELEMETRY_DISABLED=1 pnpm --filter @moysklad/web build
node apps/web/.next/standalone/server.js
```

## Monitoring uchun ma'lumot

Sentry'da quyidagi alert qoidalarini sozlang:

| Alert | Trigger |
|---|---|
| API 5xx > 1% | 5 daqiqa davomida |
| API p95 latency > 500ms | 5 daqiqa davomida |
| Webhook DLQ > 10 | 1 soat davomida |
| Email DLQ > 5 | 1 soat davomida |
| DB connection pool exhausted | har holat |
| Cron worker silent > 2 ta interval | har holat |

## Birinchi production sinov ro'yxati

Production'ga chiqishdan oldin shu adversarial test'larni o'tkazing:

1. **Concurrent login** — 50 ta foydalanuvchi parallel `/auth/login` chaqirsa, JWT correctly issued
2. **Concurrent save** — 2 ta admin bir hujjatni bir vaqtda save qilsa, oxirgi yutadi (lost update yo'q)
3. **Bulk delete 1000 ta hujjat** — timeout va memory ko'rsatkichlari
4. **Excel import 5000 qator** — fayl uzunligi axios timeout'dan past bo'lishi
5. **Soliq EDO submission failure** — provayder 500 qaytarsa, retry queue ishlashi
6. **Webhook DLQ recovery** — endpoint 24 soat off bo'lsa, ishga tushgach barcha rieldown'lar yetkazib beriladi
7. **JWT refresh during long session** — 15 daqiqadan keyin foydalanuvchi seamless qoladi
8. **DB failover** — primary o'lsa, replica'ga o'tish jarayoni
9. **i18n switch** — uz↔ru har sahifa to'g'ri tarjima ko'rsatadi (qo'lda 5-10 sahifa tekshiring)
10. **Mobile responsive** — iPad va telefon (iPhone 12 / Galaxy S22) brauzerida asosiy oqimlar ishlashi

## Ma'lumotlar himoyasi

- TLS 1.3 majburiy (Let's Encrypt yoki Cloudflare)
- HSTS header
- HttpOnly + Secure + SameSite=Strict cookie
- CSP header (Next.js avtomat sozlaydi)
- Rate limiting `/auth/login`, `/auth/refresh`, `/auth/register` (5 req / 60s / IP)
- Audit log immutable (faqat append, edit/delete yo'q)

## Skala ko'rsatkichlari (taxminiy)

| Yuk | Konfiguratsiya |
|---|---|
| **< 100 user** | 1 API instance, 1 DB instance | 4 GB RAM |
| **100-1000 user** | 2-4 API instance, 1 DB primary + 1 replica | 16 GB RAM |
| **1000-10000 user** | 4-8 API instance, DB primary + 2 replicas, Redis pub/sub | 64 GB RAM |
| **> 10000 user** | Auto-scaling group, Pgbouncer, sharding strategy | 128+ GB RAM |
