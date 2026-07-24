# PERFORMANCE-REPORT.md — Sherset ERP tezlik auditi (natijalar)

> Baseline: [`BASELINE.md`](./BASELINE.md) (2026-07-23). Bu fayl har bir **qo'llangan** o'zgarishni
> before→after o'lchov bilan qayd etadi. Temir qoida: 1 o'zgarish = 1 commit = 1 o'lchov.
> ⚠️ Nishon: jonli production VPS (Germaniya, multi-tenant). O'zgarishlar faqat `sherset` doirasida.

---

## ✅ P3 — PostgreSQL per-DB tune (2026-07-23)

**O'zgarish:** `ALTER DATABASE sherset SET random_page_cost = 1.1; work_mem = 16MB;`
([`db-tuning.sql`](./db-tuning.sql)). Per-DB — cluster restart YO'Q, boshqa tenant (erp/akademiya/servis)ga ta'sir YO'Q.

**Asos (o'lchangan):** disk = SSD (`lsblk rota=0`); default'lar `random_page_cost=4` (HDD), `work_mem=4MB`.

**Before → After (161k-qatorli `demand_positions` keng sort, `EXPLAIN ANALYZE, BUFFERS`):**

| | Sort usuli | Vaqt |
|---|---|---|
| Before (work_mem 4MB) | external merge — **disk 22MB** | **1122 ms** |
| After (work_mem 16MB) | quicksort **in-memory** (+parallel) | **536 ms** (−52%) |
| Shift (48MB, info) | quicksort in-memory | 254 ms (−77%) |

**Halol baho:** bu — keng worst-case sort. Oddiy sahifalangan list so'rovlari allaqachon indeksli/tez edi. Real foyda:
aggregate/`groupBy`-og'ir so'rovlar (masalan counterparty list) endi RAM'da; `random_page_cost=1.1` planner'ni
index-scan tomon suradi. Regressiya: yo'q (faqat planner/xotira; natija bir xil). **DB cache-hit 99.8% — DB asosiy
bo'g'iz emas edi; bu tune — to'g'ri gigiyena + o'sish uchun zaxira, halokatli-tezlik-yutug'i emas.**

**Qo'llash izohi:** yangi ulanishlar darhol oladi; API'ning mavjud Prisma pool ulanishlari recycle bo'lganda yoki
`pm2 restart sherset-api` da oladi.

---

## ✅ Bundle — optimizePackageImports + o'lik dep (2026-07-23, `9f2a5f7`)

`next.config`: `experimental.optimizePackageImports = [recharts, date-fns, date-fns-tz, lucide-react]` — barrel importlar
to'g'ridan-to'g'ri submodulega rewrite (bitta helper uchun butun paket tashilmaydi). `@tanstack/react-table` (0 import,
o'lik) olib tashlandi. **Foyda:** kam client-JS → Germaniya→UZ masofada tez sovuq yuklash. Aniq bundle-hajm deploy-build'da
o'lchanadi. Gate: web typecheck 0 · biome 0. Regressiya yo'q.

## ✅ Trigram GIN indekslar — ILIKE qidiruv (2026-07-23, `77e3300`)

Audit H2: 236 ta `ILIKE '%term%'` qidiruv, 0 trigram indeks → seq-scan. GIN + pg_trgm → index-scan.
`demands(name, description)`, `products(name)`, `counterparties(name)`. `pg_trgm` extension JONLI DB'da yaratildi;
indekslar migration (`20260723150000_trgm_search_indexes`) orqali **deploy'da** yaraladi (schema.prisma bilan sinxron →
drift yo'q). **Foyda:** qidiruv sekinligi (asosan demands 44k). Jonli before/after deploy'dan keyin.

## 📣 P1 — Cloudflare edge — TEKSHIRILDI: sayt CF ORTIDA EMAS (sizning amalingiz kerak)

**Topilma (o'lchangan):** `sherset.uz` → to'g'ridan-to'g'ri `13.140.157.10` (Germaniya origin), `Server: nginx/1.24.0`.
`cf-ray`/`cloudflare` YO'Q → **Cloudflare ishlatilmayapti.** Ya'ni har UZ foydalanuvchi har narsa (statik JS/CSS 9.8MB +
TLS handshake + dynamic) uchun to'g'ridan Germaniyaga ~90–120ms RTT to'laydi. Edge-cache/brotli/HTTP-3 yo'q.

**Bu — eng katta real-user yutuq**, LEKIN men bajarolmayman (sizning Cloudflare akkauntingiz + DNS kerak). Qadamlar:
1. Cloudflare'da `sherset.uz` zonasini qo'shing → registrar'da nameserver'larni Cloudflare'nikiga o'zgartiring
   (yoki A-record `13.140.157.10`ni **proxied**, to'q-sariq bulut, qiling).
2. SSL/TLS mode = **Full (strict)** (origin'da Certbot cert bor).
3. Speed → **Brotli ON**, **HTTP/3 (QUIC) ON**, **0-RTT ON**.
4. Caching → statik (`/_next/static/*`) edge'da keshlanadi (Next allaqachon `immutable` header beradi).
5. (Ixtiyoriy) APO/Tiered Cache. **Kutilayotgan:** statik+TLS ~10–40ms edge'dan (~100ms o'rniga) — sovuq yuklash
   sezilarli tezlashadi. Dynamic API hali origin'ga boradi (buni faqat edge-compute yoki server-ko'chirish hal qiladi).

## ✅ P2 — auth-waterfall — TEKSHIRILDI: allaqachon ~optimal (rejalashtirilgan «quick win» EMAS)

**Kodni o'qib qayta-baholash (halol):** `/auth/refresh` bitta javobda `{accessToken, user}` qaytaradi
(`auth-store.ts:151`) — alohida user-fetch YO'Q. Undan keyin `/permissions/me` + sahifa data-query'lari
`!!auth.user` bilan **parallel** (mustaqil react-query hook'lari) ketadi (`layout.tsx:90-95`). Ya'ni waterfall
allaqachon **2 ketma-ket RTT** (refresh → keyin parallel {permissions + data}) — client-SPA uchun ~optimal.
Single-flight refresh guard ham bor (`auth-store.ts:140`).

**Xulosa:** «parallellashtirish» quick-win'idan olinadigan narsa YO'Q — kod allaqachon shunday. **Soxta o'zgarish
qilmadim** (temir qoida #2). Qolgan haqiqiy struktura-yutuq: **server-side auth bootstrap** (RSC/middleware'da
HttpOnly-cookie'ni o'qib sovuq-yuklash refresh-RTT'sini butunlay olib tashlash). Bu — **o'rta loyiha** (medium
effort/risk), quick-win emas → alohida, ehtiyotkor sessiyada. Yana: `next/dynamic` + `optimizePackageImports` +
o'lik `@tanstack/react-table` dep (M4) — real, ammo alohida FE-ish.

## Meta-topilmalar (audit davomida)
- ⚠️ **VPS haddan tashqari yuklangan** — audit davomida deyarli har SSH/SFTP timeout bo'ldi (load ~5/6 yadro,
  multi-tenant contention: erp/biznesjon/akademiya/sherset/servis bir qutida). Bu o'z-o'zidan «sekin» hissiga hissa
  qo'shadi va deploy'ni ham bloklaydi. Ko'rib chiqilsin (resurs limitlari / tenant ajratish).
- ⚠️ `sherset-web` **304 restart** — beqarorlik/OOM/redeploy sababini tekshirish.
- ⚠️ `attachments` jadvali **630MB blob DB ichida** (DB'ning 83%) — disk/object-storage'ga ko'chirish backup/DB'ni yengillashtiradi.
