---
description: Sherset'ni VPS'ga deploy qilish (to'g'ri build tartibi + gotcha'lar bilan)
---

Sherset'ni jonli serverga deploy qil: https://sherset.biznesjon.uz · VPS `root@13.140.157.10` · kod `/var/www/sherset`.
Bu ko'p-ijarali box — **boshqa ilovalarga (biznesjon, global-erp, stars) TEGMA.**

Tartib (memory: `sherset-vps-deploy.md`):

1. **SSH**: `sshpass` yo'q — Python `paramiko` (scratchpad'da `ssh_run.py` uslubi) yoki SSH_ASKPASS. Parol memory faylida (`seed-real-moysklad-import.md`). Git Bash yo'l-buzilishiga `MSYS_NO_PATHCONV=1`.
2. `cd /var/www/sherset && git pull` (deploy key sozlangan)
3. `pnpm install` (corepack pnpm@10.33.0 avtomat)
4. **AVVAL** `pnpm --filter @moysklad/money build` — web'dan OLDIN (bo'lmasa `next build`: "Can't resolve @moysklad/money")
5. `pnpm build:web` — SSH ~580s timeout beradi: `nohup ... > /tmp/build.log 2>&1 &` + log-poll (`BUILD_OK` kutish)
6. `npx prisma migrate deploy` (2026-07-02 `fc1a936` dan beri drift 0 — `db push` KERAK EMAS)
7. `pm2 restart sherset-api sherset-web` (api port 4000, web 3010, nginx oldida)
8. **Jonli verify**: sahifa 200 + o'zgargan chunk ichida yangi kod haqiqatan borligini tekshir (grep chunk).
9. NEXT.md top-entry'ga «✅ DEPLOYED» belgisini qo'y.

`.env` fayllar VPS'da qo'lda (API haqiqiy faylni `apps/api/.env`dan o'qiydi; `JWT_SECRET`, `MOYSKLAD_TOKEN` shu yerda).
