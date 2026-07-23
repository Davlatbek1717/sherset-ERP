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

## ⏳ P1 — Cloudflare edge · ⏳ P2 — auth-waterfall parallel

Keyingi qadamlar (tasdiqlangan). P1 avval tekshiruv talab qiladi: sayt hozir Cloudflare ortidami. P2 = kod o'zgarishi
(deploy kerak). Har biri alohida qo'llanadi + o'lchanadi + shu yerga yoziladi.
