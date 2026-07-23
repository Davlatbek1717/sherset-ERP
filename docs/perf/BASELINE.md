# BASELINE.md — Sherset ERP tezlik auditi (Phase 1: o'lchov)

> **Sana:** 2026-07-23 · **Nishon:** jonli production VPS (`13.140.157.10`) · **Usul:** VPS'da to'g'ridan-to'g'ri
> SSH o'lchov + kodbaza statik tahlili. **Hech narsa o'zgartirilmagan** (phase 1 = faqat o'lchov).
> **Halollik:** har raqam qanday olingani belgilangan — ✅ o'lchangan · 📄 koddan · ⚠️ taxmin (asosi bilan) · ❓ tool kerak.

---

## 0. Xulosa — 2 ta narsa hamma narsani belgilaydi

1. **🌍 INFRA: Server Germaniyada, foydalanuvchilar O'zbekistonda.** (✅ o'lchangan: `Europe/Berlin`, Contabo.)
   UZ↔Germaniya RTT odatda **~90–120ms** (⚠️ aniq raqam Toshkentdan o'lchashni talab qiladi). **Kod buni tuzata olmaydi** —
   faqat CDN/edge (Cloudflare) yoki serverni yaqinroqqa ko'chirish.
2. **⚙️ KOD: Bosh sahifa server-render ~1.0s** (✅ o'lchangan, on-box, tarmoqSIZ) **+ client-only SPA + ketma-ket
   auth-waterfall** (📄 492/689 fayl `'use client'`, `0` `next/dynamic`, refresh→user→data→permissions zanjiri).
   Har sovuq yuklashda struktura kechikishi.

**Bu ikkisi KO'PAYADI:** ketma-ket ~3–4 round-trip × ~100ms (Germaniya) = faqat tarmoqda ~300–400ms, ustiga 1s render.

---

## 1. SERVER / INFRA (✅ o'lchangan, 2026-07-23 ~12:33 UTC)

| Metrika | Qiymat | Baho |
|---|---|---|
| Joylashuv | 🇩🇪 Germaniya (Europe/Berlin, Contabo) | ⚠️ UZ foydalanuvchilar uchun masofa-kechikish |
| CPU | 6 vCPU | multi-tenant (bir quti: erp, biznesjon, akademiya, sherset, sherset-servis) |
| RAM | 12 GB (8.5 GB bo'sh) | ✅ muammo emas |
| Disk | 96 GB, 30% band, `/dev/sda1` | ✅ joy yetarli |
| Load avg (1/5/15m) | **5.21 / 3.55 / 3.21** | ~87% (6 yadro) — band; boshqa tenantlar ham yuk beradi |
| nginx | gzip ✅ · sendfile ✅ · **HTTP/2 ✅** · **brotli ❌** · **HTTP/3 ❌** · explicit cache-header ❌ | |
| Bosh sahifa `/` render (on-box) | **1.008s** TTFB · 270 KB HTML · 200 | ⚠️ tarmoqSIZ — kod tomonidan |
| API `/health` | 50ms (404 — route yo'li boshqa) | ✅ API tez |
| pm2 `sherset-web` | online · 83 MB · **304 restart** | ⚠️ juda ko'p restart (beqarorlik/OOM/redeploy — tekshirish kerak) |
| pm2 `sherset-api` | online · 83 MB · 154 restart | |
| Client static (JS/CSS) | 9.8 MB (`.next/static`) | per-route breakdown ❓ |

---

## 2. MA'LUMOTLAR BAZASI (✅ o'lchangan — `sherset` DB, postgres peer-auth)

| Metrika | Qiymat | Baho |
|---|---|---|
| DB hajmi | **756 MB** | kichik |
| **Cache hit ratio** | **99.80%** | ✅ **ajoyib** — DB deyarli to'liq RAM'da; DB ko'p so'rovlar uchun bo'g'iz EMAS |
| Faol ulanishlar | 10 / max 100 | ✅ sog'lom |
| Eng katta jadval | **`attachments`: 1106 qator = 630 MB** | ⚠️ **fayllar DB ichida (BYTEA)** — DB'ning 83% i shu. Backup/shared_buffers ifloslanishi |
| Transaksion jadvallar | demand_positions 161k/43MB · demands 44k/23MB · cash_in 28k/12MB · products 4877/9MB | haqiqiy ma'lumot kichik |
| **`counterparty`** | top-10 da YO'Q → **< 1.7 MB (kichik)** | ⚠️ **RECALIBRATSIYA** (pastga qara) |
| PG config | `shared_buffers=128MB` (default) · `work_mem=4MB` (default) · `effective_cache_size=4GB` · **`random_page_cost=4`** (HDD default; SSD uchun 1.1 kerak) | default'lar; cache-hit 99.8% bo'lgani uchun ta'sir cheklangan |
| pg_stat_statements | ❌ **o'rnatilmagan** | so'rov-observability yo'q → phase-2 uchun yoqilsin |

---

## 3. FRONTEND / KOD topilmalari (📄 kodbaza tahlili; DB o'lchovlari bilan qayta-baholangan)

**HIGH:**
- **H3 — Client-only SPA + ketma-ket auth-waterfall.** 492/689 fayl `'use client'`; `(app)/layout.tsx` ham client;
  **`0` `next/dynamic`**. Sovuq navigatsiya: hydrate → `/auth/refresh` → `auth.user` → data-query'lar (`enabled: !!user`)
  → `/permissions/me`. RSC/server-prefetch yo'q → token-refresh hop hamma data'dan OLDIN ketma-ket.
  📄 `auth-store.ts:9`, `(app)/layout.tsx:91`. **Germaniya-latency bilan ko'payadi** — eng katta struktura lever.
- **H2 — Qidiruv indekslari yo'q.** `0` GIN/`pg_trgm` indeks, lekin **236** `ILIKE '%…%'` predikat. Leading-wildcard
  btree ishlatolmaydi → seq-scan. 📄 `demand.service.ts:1352`, `counterparty.service.ts:180`.
  **Qayta-baho:** eng katta qidiriladigan jadval = `demands` (44k/23MB) — seq-scan ~o'nlab ms (cache'da). `counterparty`
  KICHIK bo'lgani uchun undagi qidiruv arzon. Ya'ni H2 **demands/products** uchun muhim, halokatli emas.

**RECALIBRATSIYA (measured-data asosida — halol Amdahl):**
- Kodbaza tahlili `counterparty`ni "eng katta reference jadval, HIGH" dedi (jadval hajmini taxmin qilib). **DB o'lchovi:
  counterparty KICHIK (<1.7MB).** Shuning uchun **H1 (counterparty indekssiz sort/OFFSET) endi LOW–MED** — kichik
  jadvalda seq-scan+sort sub-ms. Kelajakda o'ssa qaytadan ko'riladi.

**MED:**
- **M1 — Har list `findMany` + alohida `count()`** = ikkinchi skan (ILIKE bilan qo'shilsa 2× seq-scan). 📄 `demand.service.ts:97,116`.
- **M3 — Counterparty list ~7 so'rov/yuklash** (findMany+count+balance.aggregate+2×groupBy+2×raw). Batch'langan (N+1 emas), lekin og'ir.
- **M4 — Code-splitting yo'q.** `0` `next/dynamic`; `next.config` da `optimizePackageImports` yo'q; `recharts` 2 HR sahifada;
  **`@tanstack/react-table` = 0 import (o'lik dep)**. Next 15 auto-split bor, shuning uchun ta'sir cheklangan.
- **DB tune (arzon):** `random_page_cost 4→1.1` (SSD) · `work_mem 4→16MB` · `shared_buffers 128MB→2GB`.

**LOW:** Prisma pool tune'lanmagan (L1) · maintenance-job N+1 yozuvlar (L4) · `attachments` DB-ichida (hygiene/backup).

**Allaqachon YAXSHI (xato bilan "tuzatilmasin"):** hujjat-listlar keyset-cursor + `select` + `_count` (read-path N+1 YO'Q,
indekslar to'liq) · enrichment `groupBy`/raw `IN(...)` (anti-N+1) · React Query `staleTime 30s`, `keepPreviousData`, no refetch-on-focus.

---

## 4. GEOGRAFIYA (✅ server o'lchangan · ⚠️ RTT taxmin · ❓ Toshkent-ping tool kerak)

- Server: Germaniya (o'lchangan). UZ→Germaniya RTT ~90–120ms (⚠️ documented range; Toshkentdan `ping`/`traceroute` bilan tasdiqlansin).
- Sovuq yuklash zanjiri: DNS + TCP + TLS (~2 RTT) + auth-waterfall (~3–4 ketma-ket RTT) = faqat **tarmoqda ~400–700ms**,
  keyin 1s render. Bu "sayt qotib ishlaydi" hissining asosiy qismi.

---

## 5. HALI O'LCHANMAGAN (phase-2 dan oldin kerak)

| Nima | Nega | Kim |
|---|---|---|
| Lighthouse / Core Web Vitals (LCP/INP/CLS) | Real brauzer metrikasi | ❓ siz brauzerda yugurtirasiz yoki men tool bilan |
| Toshkentdan `ping`/`traceroute` | RTT floor aniq raqami | ❓ UZ-vantage kerak |
| `pg_stat_statements` top-20 | Empirik eng qimmat so'rovlar (Amdahl) | ❓ extension yoqilsin, keyin o'lchov |
| `EXPLAIN (ANALYZE, BUFFERS)` — demand list default-sort + 1 ILIKE search | H2 aniq narxi | phase-2 |
| Per-route JS bundle breakdown | H3/M4 aniq og'irligi | phase-2 (`next build` analyze) |

---

## 6. PRIORITET MATRITSASI (measured-data asosida; 4 raqam har biriga)

| # | Muammo | Hozirgi (o'lchangan) | Kutilayotgan (⚠️ taxmin/tasdiqlansin) | Mehnat | Risk | Tier |
|---|--------|----------|-----------|--------|------|------|
| **P1** | **Cloudflare edge/CDN** (statik + TLS edge'da, brotli, HTTP/3) | ~90–120ms RTT × har RT | Statik/TLS ~5–20ms edge; dynamic origin qoladi | 2–4s | past | **TEZ G'ALABA** |
| **P2** | **Auth-waterfall parallel** (refresh+permissions+data ketma-ket → parallel/RSC-prefetch) | ~3–4 seriyali RTT | −1…2 RTT (~100–250ms sovuq yuklashda) | 3–6s | o'rta | **TEZ G'ALABA** |
| **P3** | **DB tune** `random_page_cost=1.1`, `work_mem=16MB`, `shared_buffers=2GB` | default'lar | index-scan afzalligi + kam disk-sort | 30min + restart | past | **TEZ G'ALABA** |
| P4 | GIN/`pg_trgm` indeks (demands/products search) | ILIKE seq-scan | index-scan search | 1–2s | past | katta |
| P5 | Bosh sahifa 1s render — profiling (nega 1s?) | 1.008s on-box | measure-first | 2–4s | o'rta | katta |
| P6 | `next/dynamic` + `optimizePackageImports` + o'lik dep olib tashlash | 9.8MB static | kichikroq per-route JS | 2–4s | past | katta |
| P7 | `attachments` DB→disk/object-storage | 630MB DB blob | yengil DB/backup | 1–2 kun | o'rta | keyin |
| P8 | pm2 `sherset-web` 304 restart sababini topish | beqaror | barqaror | 1–2s | past | tekshir |

---

## 7. 3 TA TEZ G'ALABA (prompt so'ragan — tasdiqlasangiz shulardan boshlayman)

1. **P3 — DB config tune** (30 daqiqa, past risk): `random_page_cost=1.1` (SSD), `work_mem=16MB`, `shared_buffers=2GB`
   → index-scan afzal ko'riladi, sort'lar disk'ka tushmaydi. Faqat sherset DB / postgresql.conf.
2. **P1 — Cloudflare oldida** (agar hali yo'q bo'lsa): statik + TLS + brotli + HTTP/3 edge'da → Germaniya-masofasini
   statik-content uchun kesadi. Eng katta real-user yutuq, past risk.
3. **P2 — Auth-waterfall'ni parallellashtirish**: `/auth/refresh` + `/permissions/me` + birinchi data-query'ni
   ketma-ket emas, parallel qilish (yoki RSC-prefetch) → sovuq yuklashda bir necha RTT tejaladi.

> ⚠️ **Hech narsa o'zgartirilmadi.** Tasdiqlang — qaysi tez-g'alabadan boshlayman + Lighthouse/Toshkent-ping'ni
> siz yugurtirasizmi yoki men tool bilan qilaymi. Har o'zgarish = 1 commit = qayta o'lchov (temir qoida #4).
