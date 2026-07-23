# TEZLIK AUDITI — BASELINE (1-bosqich)

**Target:** Sherset / climart-adoption · **Sana:** 2026-07-23 · **O'lchov:** lokal mashina, PROD build (`build:web` + `next start`), api `tsx` prod, PostgreSQL 5432 (`climart_adopt`, seed-data).

> ⚠️ **HALOL CAVEAT'LAR (raqamlarni shu bilan o'qing):**
> 1. **Lokal mashina** — production VPS EMAS. CPU/RAM/disk boshqacha.
> 2. **DB'da faqat SEED-data** (2 kontragent, 3 tovar, 0 demand) → **DB-metrikalar vakil EMAS** (real prod'da minglab qator → query/scan/index butunlay boshqacha).
> 3. **TTFB lokalda tarmoqsiz** (27-48ms) → real prod'da + tarmoq-RTT (Contabo Germaniya→UZ **~60-130ms**). Ya'ni kodni qanchalik optimallashtirmagin, foydalanuvchida shuncha ms **masofa**da ketadi.
> 4. **Faqat 2 metrika ishonchli-vakil:** (a) **bundle-hajmlar** (deterministik) · (b) **~210ms API per-request floor** (sof server-compute — prod'da ham qoladi, ustiga tarmoq).

## 1. Frontend (bundle + page-load)

| Metrika | Qiymat |
|---|---|
| Shared JS (barcha route) | **102 kB** (2 chunk: 46+54kB) + middleware 32.6kB |
| Birinchi yuk (login, sovuq) | **253 kB JS / 272 kB total**, Load 487ms, 16 req |
| Eng og'ir route'lar (First Load JS) | /stores 313kB · /supplies 290kB · /variants 267kB · /tasks 252-265kB |
| Client-navigatsiya (login'dan keyin) | tez: 4-29 kB, Load 75-126ms (Next App Router RSC) |
| LCP | ⚠️ o'lchanmadi (headless observer tutmadi — o'lchov-kamchiligi, tuzatiladi) |

**Page-load (prod, lokal):**
| Sahifa | TTFB | DCL | Load | Reqs | Transfer |
|---|---|---|---|---|---|
| login (sovuq) | 302ms | 398ms | 487ms | 16 | 272 kB (JS 253) |
| dashboard | 35ms | 125ms | 126ms | 27 | 4 kB |
| counterparties | 48ms | 86ms | 115ms | 29 | 29 kB |
| debts | 30ms | 66ms | 82ms | 36 | 22 kB |
| customer-orders | 27ms | 75ms | 75ms | 28 | 18 kB |

## 2. API (latency, 10 run median·max, lokal server-compute)

| Endpoint | median | max |
|---|---|---|
| /counterparties?limit=50 | 236 | 279 |
| /products?limit=50 | 243 | 299 |
| /demands?limit=50 | 229 | 240 |
| /customer-orders?limit=50 | 225 | 239 |
| /debts?limit=50 | 211 | 221 |
| /stores | 215 | 235 |
| /organizations | 210 | 224 |
| /analitika/dashboard | 210 | 220 |

🔴 **STANDOUT:** hatto eng oddiy `/organizations`/`/stores` ~210ms — **barcha endpoint'da ~210ms floor** (query farqi ~30ms). DB'dan EMAS (cache 99.92%, jadvallar mikro). → **har-so'rov app-overhead** (gumon: auth/permissions guard per-request DB-lookup, JWT/guard zanjiri, yoki tsx-runtime). **Eng katta bo'lak — Amdahl bo'yicha birinchi shu tekshiriladi.**

## 3. Ma'lumotlar bazasi

| Metrika | Qiymat |
|---|---|
| Cache hit ratio | 99.92% (data RAM'ga sig'adi — seed kichik) |
| Aktiv connection | 10 (Prisma pool) |
| pg_stat_statements | ❌ o'chiq (query-profiling uchun yoqish kerak) |
| Eng katta jadval | role_permissions 288kB/1824 · products 192kB/3 |
| Tuning | shared_buffers 128MB · work_mem 4MB (PG18 default) |

> DB seed-data bo'lgani uchun bu bo'lim **prod'ni ifodalamaydi** — real audit prod-DB (yoki real-hajmli nusxa) da qayta o'lchanadi.

## 4. Diagnostika prioriteti (2-bosqich uchun gumonlar)

1. 🔴 **~210ms API floor** (eng katta, barcha endpoint) — auth/permissions guard yoki framework overhead. Prod'da ham qoladi + tarmoq ustiga.
2. 🟠 **253 kB birinchi-yuk JS** (sovuq) — sekin-mobil tarmoqda ~2-4s. Code-splitting/tree-shake nomzodi.
3. 🟠 **Og'ir route'lar 250-313 kB** — stores/supplies/variants/tasks.
4. 🟡 **Prod-tarmoq masofasi** (Germaniya→UZ RTT) — Cloudflare/edge yoki UZ-region kerakmi (infra qarori).
5. ⚪ **DB** — prod-hajmda qayta o'lchash + pg_stat_statements + index audit.

## Keyingi qadam
Bu — faqat baseline. **Hech narsa o'zgartirilmadi.** Tasdiqlasangiz: 2-bosqich (diagnostika — 210ms floor'ni instrumentatsiya bilan ochish) → 3-bosqich (prioritet) → 3 ta tez-g'alaba.
