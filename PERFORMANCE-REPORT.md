# TEZLIK AUDITI — HISOBOT

**Target:** Sherset / climart-adoption · **Sana:** 2026-07-23 · **Muhit:** lokal, PROD build (`next start` + `tsx`), PG 5432 seed-data.

## 🔴 Eng muhim topilma — «210ms API floor» YOLG'ON edi (o'lchov-artefakti)

Baseline'da barcha API-endpoint ~210ms deб o'lchagandim (curl bilan). Diagnostika (pino-http `responseTime` + Node-fetch) buni **RAD ETDI**:
- `/organizations` server-`responseTime` = **12ms** (curl 210ms EMAS).
- To'g'ri o'lchov (Node fetch, curl-process overhead'siz): p50 **1-10ms**, p95 ≤30ms.
- **Sabab:** Windows Git-Bash'da har `curl`-chaqiruvi ~200ms process-spawn qo'shadi → mening latency-o'lchovim curl-overhead'ni o'lchagan, API'ni EMAS.

> **Xulosa:** API **tez**, tuzatiladigan narsa yo'q edi. Temir qoida #1/#2 (axlat-o'lchovga ishonma, taxminni tekshir) — diagnostika meni **yo'q muammoni «tuzatishdan»** saqladi.

## Baseline → Natija

| Metrika | Baseline | Natija | Izoh |
|---|---|---|---|
| API p50 (list endpoint) | ~210ms (❌ artefakt) | **1-10ms** (✅ to'g'ri) | o'lchov tuzatildi, kod emas |
| Dashboard (`/`) First Load JS | recharts statik (~364kB ekvivalent) | **249 kB** | recharts → dynamic (~115kB kamaydi) |
| Shared JS | 102 kB | 102 kB | o'zgarmadi |
| Kesh | — | **tozalandi** (.next/.turbo/.cache) + toza rebuild | |
| DB cache-hit | 99.92% | 99.92% | seed-data (vakil emas) |

## Qilingan o'zgarish (isbotlangan, regressiyasiz)

**Dashboard recharts → dynamic import** (`_dashboard-charts.tsx` + `next/dynamic ssr:false`):
- recharts (~150-200kB) endi dashboard'ning **birinchi-yukidan chiqarildi** — grafiklar client'da skeleton bilan oqib keladi.
- Tasdiq: dashboard 4 recharts-container render, **0 console-error**, typecheck 0, biome 0.
- Ta'sir: dashboard (login'dan keyingi 1-sahifa) birinchi-yuki ~115kB yengil.

## Qilinmagan, lekin tavsiya (sabab bilan)

1. **hr + hr/reports** (endi eng og'ir: 364/372kB) — hali recharts **statik**. Aynan shu dynamic-pattern qo'llanadi. *Qilinmadi: niche sahifalar (HR-hisobot kam-tashrif) — §3 Amdahl bo'yicha dashboard'dan past prioritet.* **Xohlasangiz — 10 daqiqa.**
2. **products/[id] (331kB), stores (313kB)** — recharts EMAS; og'irlik forma/picker/table'dan. Bundle-analyzer bilan chuqur analiz kerak (bir dep emas).
3. **🌍 Prod-tarmoq masofasi** — Contabo Germaniya→UZ RTT **~60-130ms** har so'rovga. Bu **kod bilan tuzatilmaydi** — Cloudflare (edge-cache statik + `stale-while-revalidate` HTML) yoki UZ-region infra qarori. **Real foydalanuvchi tezligiga eng katta ta'sir shu — lekin infra, kod emas.**
4. **DB prod-audit** — bu o'lchov **seed-data** (2 kontragent/3 tovar) → vakil emas. Prod-hajmda: `pg_stat_statements` yoq → eng qimmat query → `EXPLAIN` → index audit. shared_buffers 128MB→prod-RAM'ga moslash.

## Keyingi bo'g'iz (10x o'sishda birinchi nima sinadi)
1. **Prod-tarmoq RTT** (agar foydalanuvchi UZ'da, server Germaniyada) — barcha boshqa optimizatsiyadan katta.
2. **DB query'lar prod-hajmda** — hozir mikro, lekin minglab qatorda index-yo'qligi/N+1 chiqadi (seed'da ko'rinmaydi).
3. **Bundle** (250-370kB route'lar) — sekin-mobil tarmoqda birinchi-yuk.

## Halol yakuniy baho
Bu app **lokalda tez** (API 1-10ms, client-nav 75-126ms). Baseline'dagi eng katta «muammo» (210ms) o'lchov-xatosi edi. Yagona qo'llangan kod-yutuq — dashboard recharts-lazy. Real foydalanuvchi-tezligiga eng katta lever — **prod-infra (tarmoq masofasi)**, kod emas. To'liq audit uchun **prod-VPS + prod-hajmli DB** kerak (lokal seed vakil emas).
