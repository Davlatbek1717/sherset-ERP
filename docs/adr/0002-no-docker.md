# ADR-0002: Docker ishlatilmaydi

- **Holati:** Qabul qilindi
- **Sana:** 2026-04-17

## Kontekst va muammo

Loyihada PostgreSQL 16, Redis 7, MinIO (S3 emulatsiyasi), Mailhog (SMTP) — 4 ta external service'ga ega. Deploy target — bitta VPS (keyingi fazalarda kengaymasligi hozir aniq emas).

## Qarorning natijasi

**Docker umuman ishlatilmaydi** — na local dev, na production.

- Local dev (Windows): native installer'lar orqali o'rnatish
- Production (VPS): bare metal Ubuntu server, systemd + PM2 + Nginx

## Sabab

### Local dev uchun
- Docker Desktop — Windows'da 2-4 GB RAM yeydi, startup 30-60 soniya
- Memurai (native Redis for Windows) va PostgreSQL native installer mavjud
- MinIO + Mailhog — oddiy `.exe` binary, daemon holida ishlaydi
- Dev DX native'da sezilarli yaxshi (oddiy debug, log, process inspection)

### Production uchun
- Bitta VPS — Docker overhead mantiqsiz
- PM2 cluster mode + Nginx zero-downtime deploy'ni beradi
- Log rotation, process restart, memory limits — systemd va PM2 native'da yaxshi boshqaradi
- Rollback — `git revert` + redeploy (30 soniya)

## Ko'rib chiqilgan variantlar

### Docker Compose har joyda (rad etildi)
**Afzalligi:** dev==prod garantiya, oson setup
**Kamchiligi:** Windows'da og'ir, prod'da bitta VPS uchun ortiqcha abstraction

### Docker faqat dev'da (rad etildi)
**Afzalligi:** dev standartlashtiriladi
**Kamchiligi:** dev!=prod, bug reproduction qiyin, qo'shimcha texnologiya stack'ga

### Kubernetes (rad etildi)
**Afzalligi:** scale ready
**Kamchiligi:** Bitta VPS uchun juda ortiqcha, 2+ VPS bo'lganda qayta ko'rib chiqiladi

## Oqibatlari

### Ijobiy
- RAM va CPU yengilroq (VPS'da 500 MB tejash)
- Debug to'g'ridan-to'g'ri process'ga ulanadi
- Deploy script sodda: `ssh + git pull + pnpm build + pm2 reload`
- Ikki texnologiya stack'i o'rganish shart emas (Docker + Kubernetes o'rnida)

### Salbiy / cheklovlar
- Dev va prod bir xil muhit emas — masalan PostgreSQL ekstra konfiguratsiya (pg_hba.conf) dev'da unutilishi mumkin — **yumshatiladi:** `scripts/setup-dev.sh` va `scripts/setup-prod.sh` aniq bir xil PostgreSQL/Redis versiya va konfiguratsiyani o'rnatadi
- "Works on my machine" xavfi — **yumshatiladi:** CI'da Ubuntu runner + bir xil setup script

### Neytral
- Kelajakda (1 yildan keyin, agar 3+ VPS bo'lsa) Docker/Kubernetes'ga o'tish mumkin — arxitektura bunga moslashgan (12-factor app)

## Deploy oqimi

```bash
# GitHub Actions
- ssh vps "cd /opt/moysklad && git pull"
- ssh vps "cd /opt/moysklad && pnpm install --production"
- ssh vps "cd /opt/moysklad && pnpm build"
- ssh vps "cd /opt/moysklad && pnpm db:migrate:deploy"
- ssh vps "pm2 reload ecosystem.config.js"
- ssh vps "pm2 save"
```

Zero-downtime: PM2 cluster mode (4 instance Round-Robin behind Nginx).

## Dev environment setup

**Windows:**
```powershell
# PostgreSQL 16
winget install PostgreSQL.PostgreSQL.16

# Memurai (Redis-mos)
winget install Memurai.MemuraiDeveloper

# MinIO
Invoke-WebRequest "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" -OutFile minio.exe

# Mailhog
Invoke-WebRequest "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe" -OutFile mailhog.exe

# Databaseni yaratish
psql -U postgres -c "CREATE DATABASE moysklad_dev;"
```

**Linux / Mac:**
```bash
# Native brew / apt installs
# Setup script: ./scripts/setup-dev.sh
```

## Bog'liq hujjatlar

- [README.md — dev setup](../../README.md)
- [scripts/setup-dev.*](../../scripts/)
- [ecosystem.config.js — PM2](../../ecosystem.config.js)
