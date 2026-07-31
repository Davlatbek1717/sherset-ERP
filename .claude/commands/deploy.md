---
description: Sherset'ni VPS'ga deploy qilish (to'g'ri build tartibi + gotcha'lar bilan)
---

VPS `root@13.140.157.10` — ko'p-ijarali box, **boshqa ilovalarga (biznesjon, global-erp, stars) TEGMA.**

## ⚠️ IKKITA ALOHIDA SHERSET DEPLOYMENTI — adashtirmang

| Sayt | Yo'l | Branch | pm2 | DB | Skript chaqiruvi |
|---|---|---|---|---|---|
| **erp.sherset.uz** ← **FAOL PROD** | `/var/www/sherset-v2` | `climart-adoption` | `sherset-v2-web` / `sherset-v2-api` | `sherset_v2` | **`DS_TARGET=v2`** |
| sherset.biznesjon.uz (eski) | `/var/www/sherset` | `main` | `sherset-web` / `sherset-api` | `sherset` | (standart) |

**2026-07-31 gacha `deploy-smart.sh` FAQAT eski deploymentga qattiq bog'langan edi** — shuning uchun
erp.sherset.uz qo'lda bir qatorli buyruq bilan deploy qilinardi, unda esa `prisma migrate deploy` ham,
API restart ham YO'Q edi. Natija: prod uzilishi (`GET /demands/:id` → 500, kod `cell_id` bilan ketdi,
ustun bazada yo'q edi). Endi skript ikkalasini ham qo'llab-quvvatlaydi — **qo'lda deploy qilmang.**

Tartib (memory: `sherset-vps-deploy.md`):

1. **SSH**: `sshpass` yo'q — Python `paramiko` (scratchpad'da `ssh_run.py` uslubi) yoki SSH_ASKPASS. Parol memory faylida (`seed-real-moysklad-import.md`). Git Bash yo'l-buzilishiga `MSYS_NO_PATHCONV=1`.
2. **SMART DEPLOY (MAJBURIY — sekin-deploy tuzatildi, 2026-07-23):** qo'lda `git pull`+`pnpm install`+`build`+`migrate`
   ketma-ketligini YOZMA. Buning o'rniga bitta skript — u DIFF'ni ko'rib FAQAT kerakli qadamni bajaradi:
   ```
   # erp.sherset.uz (FAOL PROD):
   nohup env DS_TARGET=v2 bash /var/www/sherset-v2/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &
   # sherset.biznesjon.uz (eski):
   nohup bash /var/www/sherset/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &
   ```
   keyin `/tmp/deploy.log`ni poll qil (`git rev-parse HEAD` → `restart` → oxiri). Nega: `next build` ~580s SSH
   timeout'dan uzun; skript git-diff'ga qarab **backend-only o'zgarishda BUILD'ni butunlay o'tkazib yuboradi**
   (tsx → build yo'q → deploy soniyalarda), `pnpm install`ni faqat `pnpm-lock.yaml` o'zgarsa ishlatadi.
   FE o'zgarishda esa money→web incremental build (`.next/cache` saqlanadi).
   **`prisma migrate deploy` esa DOIM yugurtiriladi** (idempotent, ~1s) — diff'ga bog'lash ishonchsiz: migratsiya
   avvalgi commitda kelib, bu box'da qo'llanmagan bo'lsa diff bo'sh chiqadi va drift jimgina qoladi (2026-07-31 uzilishi).
   *(Skript faqat tanlangan `APP_DIR` + uning ikki pm2 ilovasiga tegadi; pm2 nomi topilmasa DARHOL to'xtaydi.)*
   - **VPS origin'dan pull qiladi** → lokal commitlar avval **GitHub'ga push** bo'lishi kerak (yoki bundle-fallback,
     `scratchpad/`dagi `git bundle → sftp → git fetch`+`reset --hard` uslubi — remote yo'q/diverged holatda).
   - Emergency bir-martalik build gotcha (agar qo'lda qilsang): money'ni web'dan OLDIN build qil
     (`pnpm --filter @moysklad/money build`), aks holda `next build`: «Can't resolve @moysklad/money».
8. **Jonli verify**: sahifa 200 + o'zgargan chunk ichida yangi kod haqiqatan borligini tekshir (grep chunk).
9. NEXT.md top-entry'ga «✅ DEPLOYED» belgisini qo'y.

`.env` fayllar VPS'da qo'lda (API haqiqiy faylni `apps/api/.env`dan o'qiydi; `JWT_SECRET`, `MOYSKLAD_TOKEN` shu yerda).
