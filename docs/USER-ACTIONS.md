# User Actions — siz bajarishingiz kerak

> ⚠️ **HISTORICAL — SUPERSEDED**
> Discovery phase'idagi capture amallari to'liq bajarilgan (5259 artifact + 79 schema +
> 36 FSM + 14 business rule + 15 pattern). Joriy ish ko'rsatmasi uchun: `RESUME.md`.
> Bu hujjat tarixiy yozuv sifatida saqlanadi.

Phase 3 capture scripts tayyor, lekin **sizning Moysklad sessiyangiz** kerak (Playwright yoki API token). Hamma scriptlarni ishga tushurganingizdan keyin Phase 4 (consolidation) boshlanadi.

## 4 ta harakat — taxminiy vaqt: 2-4 soat

### 1. Refresh auth (agar kerak bo'lsa)

```bash
pnpm --filter @moysklad/capture auth
```
Brauzer ochiladi → Moysklad'ga login qiling → press Enter console'da.

### 2. Admin sub-pages discovery (5 daqiqa)

```bash
pnpm --filter @moysklad/capture discover-settings
```

Output: `docs/moysklad-reference/admin/settings-discovery.json`

Bu barcha admin sub-sahifalar linklarini topadi. Natijani menga yuboring, men `routes.ts`'ga qo'shaman.

### 3. Print templates scraping (~20 daqiqa)

```bash
pnpm --filter @moysklad/capture scrape-print-templates
```

Output: `docs/moysklad-reference/print-templates/<slug>/...`

36 document type × ~3 ta template = ~100 HTML + CSS + variable JSON.

### 4. Reports detail scraping (~15 daqiqa)

```bash
pnpm --filter @moysklad/capture scrape-reports
```

Output: `docs/moysklad-reference/reports/<id>/...`

17 ta report × default + filters + 4 ta variation = ~80 screenshot + DOM.

### 5. Live API metadata verification (~10 daqiqa)

```bash
# API token olish:
# 1. Moysklad'da: Sozlamalar → Токены API → Сгенерировать новый токен
# 2. Token'ni copy qiling

MOYSKLAD_API_TOKEN="your-token-here" npx tsx tools/verify-api/verify.ts
```

Output: `docs/moysklad-reference/data-model/_verification-report.json`

Bu 79 schema'ni live API bilan solishtiradi:
- `verified` — to'g'ri
- `drift` — qaysi maydonlar yangi/eski
- `not_found` — bu entity API'da yo'q (yoki qayta nomlangan)

## Ketma-ketlik

```bash
# (agar session eski bo'lsa, 1-qadam)
pnpm --filter @moysklad/capture auth

# 2-4 ketma-ket:
pnpm --filter @moysklad/capture discover-settings
pnpm --filter @moysklad/capture scrape-print-templates
pnpm --filter @moysklad/capture scrape-reports

# Alohida (API token bilan):
MOYSKLAD_API_TOKEN="xxx" npx tsx tools/verify-api/verify.ts
```

## Agar xato chiqsa

- **Chromium crash** — skriptni qayta ishga tushuring (state saqlanadi)
- **Session expired** — `pnpm auth` ni qayta ishlating
- **Rate limit** — 10 daqiqa kuting, keyin qayta ishlating
- **API 401** — token yaroqsiz, yangi token oling

## Natijalarni menga yuboring

Har script tugaganidan keyin menga **"Yakunlandi"** deb yozing. Men:

1. `settings-discovery.json` ni tahlil qilib yangi route'larni `routes.ts`ga qo'shaman
2. `_verification-report.json` ni tahlil qilib schema drift'larni tuzataman
3. Print template HTML'dan keyin templatelarni clone uchun seed qilaman
4. Reports capture'laridan har reportga dedicated JSON spec yozaman

## Keyingi qadam

Barcha 5 script yakunlanganidan keyin **Phase 4** boshlanadi:
- Coverage 100% tekshiriladi
- Validatorlar qayta ishga tushuriladi
- HANDOFF yangilanadi
- **Sprint 1 launch** uchun green light

---

**Muhim:** Bu scriptlar **bizning Moysklad hisobimizda** (ozodbekmirgasimov@gmail.com) ishlaydi. Hech qanday ma'lumot o'zgartirilmaydi — faqat O'QIYDI. Xavfsiz.
