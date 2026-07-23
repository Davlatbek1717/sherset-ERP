---
description: Sherset'ni VPS'ga deploy qilish (to'g'ri build tartibi + gotcha'lar bilan)
---

Sherset'ni jonli serverga deploy qil: https://sherset.biznesjon.uz · VPS `root@13.140.157.10` · kod `/var/www/sherset`.
Bu ko'p-ijarali box — **boshqa ilovalarga (biznesjon, global-erp, stars) TEGMA.**

Tartib (memory: `sherset-vps-deploy.md`):

1. **SSH**: `sshpass` yo'q — Python `paramiko` (scratchpad'da `ssh_run.py` uslubi) yoki SSH_ASKPASS. Parol memory faylida (`seed-real-moysklad-import.md`). Git Bash yo'l-buzilishiga `MSYS_NO_PATHCONV=1`.
2. **SMART DEPLOY (MAJBURIY — sekin-deploy tuzatildi, 2026-07-23):** qo'lda `git pull`+`pnpm install`+`build`+`migrate`
   ketma-ketligini YOZMA. Buning o'rniga bitta skript — u DIFF'ni ko'rib FAQAT kerakli qadamni bajaradi:
   ```
   nohup bash /var/www/sherset/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &
   ```
   keyin `/tmp/deploy.log`ni poll qil (`git rev-parse HEAD` → `restart` → oxiri). Nega: `next build` ~580s SSH
   timeout'dan uzun; skript git-diff'ga qarab **backend-only o'zgarishda BUILD'ni butunlay o'tkazib yuboradi**
   (tsx → build yo'q → deploy soniyalarda), `pnpm install`ni faqat `pnpm-lock.yaml` o'zgarsa, `prisma migrate`ni
   faqat yangi migration bo'lsa ishlatadi. FE o'zgarishda esa money→web incremental build (`.next/cache` saqlanadi).
   *(Skript faqat `/var/www/sherset` + `sherset-api`/`sherset-web`ga tegadi — boshqa tenantga YO'Q.)*
   - **VPS origin'dan pull qiladi** → lokal commitlar avval **GitHub'ga push** bo'lishi kerak (yoki bundle-fallback,
     `scratchpad/`dagi `git bundle → sftp → git fetch`+`reset --hard` uslubi — remote yo'q/diverged holatda).
   - Emergency bir-martalik build gotcha (agar qo'lda qilsang): money'ni web'dan OLDIN build qil
     (`pnpm --filter @moysklad/money build`), aks holda `next build`: «Can't resolve @moysklad/money».
8. **Jonli verify**: sahifa 200 + o'zgargan chunk ichida yangi kod haqiqatan borligini tekshir (grep chunk).
9. NEXT.md top-entry'ga «✅ DEPLOYED» belgisini qo'y.

`.env` fayllar VPS'da qo'lda (API haqiqiy faylni `apps/api/.env`dan o'qiydi; `JWT_SECRET`, `MOYSKLAD_TOKEN` shu yerda).
